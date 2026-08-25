"""Step 8: reference annotation model with donor-level validation, calibration and abstention.

Pipeline (Kang 2018, 8 donors, 8 PBMC cell types):
  counts -> log1p(CP10k) -> top-K HVG (train only) -> scale by train std, clip 10
  -> L1 multinomial logistic regression.
  1) C chosen once by donor-grouped 4-fold CV on a cell subsample (log-loss).
  2) Leave-one-donor-out (8 folds): out-of-fold (OOF) probabilities for every cell.
  3) Temperature scaling fit on pooled OOF logits (cross-validated calibration).
  4) Abstention threshold on calibrated max-prob: smallest tau with accuracy >= TARGET among accepted.
  5) Cluster-level evaluation (mean prob per (donor, cluster)).
  6) Final model on all donors -> results/reference_model.json for the browser.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.optimize import minimize_scalar
from scipy.special import log_softmax, softmax
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, log_loss
from sklearn.model_selection import GroupKFold

from prep import CLUSTER, DONOR, LABEL, Scaler, gene_filter, load, lognorm

HERE = Path(__file__).parent
OUT = HERE / "results"
SEED = 0
N_HVG = 3000
C_GRID = [0.03, 0.1, 0.3]
TARGET_ACC = 0.97  # accuracy required among non-abstained cells
MAX_ITER = 200

rng = np.random.default_rng(SEED)
log_f = None


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    log_f.write(s + "\n")
    log_f.flush()


def hvg(L: sparse.csr_matrix, k: int) -> np.ndarray:
    """top-k genes by normalized dispersion (var/mean of log-normalized values), train only."""
    mean = np.asarray(L.mean(0)).ravel()
    sq = np.asarray(L.multiply(L).mean(0)).ravel()
    var = np.maximum(sq - mean**2, 0)
    disp = var / np.maximum(mean, 1e-12)
    disp[mean < 1e-4] = 0
    return np.sort(np.argsort(-disp)[:k])


class Pipe:
    """gene subset + scaler + classifier, fit on training cells only."""

    def __init__(self, C):
        self.C = C

    def fit(self, L, y):
        base = gene_filter(L)
        self.genes = base[hvg(L[:, base], N_HVG)]
        self.sc = Scaler().fit(L[:, self.genes])
        Z = self.sc.transform(L[:, self.genes])
        self.clf = LogisticRegression(penalty="l1", solver="saga", C=self.C, max_iter=MAX_ITER, tol=1e-3, random_state=SEED).fit(Z, y)
        return self

    def logits(self, L):
        Z = self.sc.transform(L[:, self.genes])
        return Z @ self.clf.coef_.T + self.clf.intercept_


def fit_temperature(logits, y_idx):
    """T minimizing NLL of softmax(logits / T)."""
    def nll(T):
        return -log_softmax(logits / T, axis=1)[np.arange(len(y_idx)), y_idx].mean()
    return float(minimize_scalar(nll, bounds=(0.3, 10), method="bounded").x)


def ece(conf, correct, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(e)


# ---------------- data ----------------
t0 = time.time()
import os
CTRL_ONLY = os.environ.get("CTRL_ONLY") == "1"   # drop IFN-beta stimulated cells
TAG = "_ctrl" if CTRL_ONLY else ""
log_f = open(OUT / f"reference{TAG}_log.txt", "w")
a, X = load(HERE / "data" / "kang_2018.h5ad")
if CTRL_ONLY:
    keep = (a.obs["label"].astype(str) == "ctrl").to_numpy()
    a, X = a[keep].copy(), X[keep]
L = lognorm(X)
y = a.obs[LABEL].astype(str).to_numpy()
donor = a.obs[DONOR].astype(str).to_numpy()
cluster = a.obs[CLUSTER].astype(str).to_numpy()
classes = np.unique(y)
y_idx = np.searchsorted(classes, y)
donors = np.unique(donor)
log(f"cells {L.shape[0]}, genes {L.shape[1]}, donors {len(donors)}, classes {len(classes)}  (prep {time.time()-t0:.0f}s)")

# ---------------- 1) choose C (donor-grouped CV on a subsample) ----------------
sub = rng.choice(L.shape[0], 8000, replace=False)
gkf = GroupKFold(n_splits=4)
best = None
for C in C_GRID:
    ll, acc = [], []
    for tr, va in gkf.split(sub, groups=donor[sub]):
        p = Pipe(C).fit(L[sub[tr]], y[sub[tr]])
        P = softmax(p.logits(L[sub[va]]), axis=1)
        ll.append(log_loss(y[sub[va]], P, labels=classes))
        acc.append(accuracy_score(y[sub[va]], classes[P.argmax(1)]))
    log(f"C={C}: grouped-CV logloss {np.mean(ll):.3f}  acc {np.mean(acc):.3f}  ({time.time()-t0:.0f}s)")
    if best is None or np.mean(ll) < best[1]:
        best = (C, float(np.mean(ll)))
C_best = best[0]
log(f"C chosen: {C_best}")

# ---------------- 2) leave-one-donor-out ----------------
oof_logits = np.zeros((L.shape[0], len(classes)), dtype=np.float32)
fold_rows = []
for dn in donors:
    te = donor == dn
    p = Pipe(C_best).fit(L[~te], y[~te])
    lg = p.logits(L[te])
    oof_logits[te] = lg
    acc = accuracy_score(y[te], classes[lg.argmax(1)])
    nz = int((np.abs(p.clf.coef_) > 1e-6).any(0).sum())
    fold_rows.append(dict(donor=dn, n=int(te.sum()), acc=float(acc), genes_used=nz))
    log(f"LODO {dn}: n={te.sum()} acc {acc:.3f} genes used {nz} ({time.time()-t0:.0f}s)")

P_raw = softmax(oof_logits, axis=1)
pred = P_raw.argmax(1)
acc_all = accuracy_score(y_idx, pred)
bacc = balanced_accuracy_score(y_idx, pred)
log(f"\nOOF over all donors: accuracy {acc_all:.4f}, balanced accuracy {bacc:.4f}, log-loss {log_loss(y_idx, P_raw, labels=range(len(classes))):.4f}")

# ---------------- 3) temperature scaling (fit on OOF, i.e. never on training cells) ----------------
T = fit_temperature(oof_logits, y_idx)
P_cal = softmax(oof_logits / T, axis=1)
correct = (pred == y_idx).astype(float)
log(f"temperature T = {T:.3f}   ECE raw {ece(P_raw.max(1), correct):.4f} -> calibrated {ece(P_cal.max(1), correct):.4f}")
log(f"log-loss raw {log_loss(y_idx, P_raw, labels=range(len(classes))):.4f} -> calibrated {log_loss(y_idx, P_cal, labels=range(len(classes))):.4f}")

conf = P_cal.max(1)
rel = []
for lo, hi in [(0, .5), (.5, .6), (.6, .7), (.7, .8), (.8, .9), (.9, .95), (.95, .99), (.99, 1.01)]:
    m = (conf >= lo) & (conf < hi)
    if m.any():
        rel.append(dict(lo=lo, hi=min(hi, 1), n=int(m.sum()), conf=float(conf[m].mean()), acc=float(correct[m].mean())))
        log(f"  conf [{lo:.2f},{min(hi,1):.2f})  n={m.sum():6d}  mean conf {conf[m].mean():.3f}  acc {correct[m].mean():.3f}")

# ---------------- 4) abstention threshold ----------------
taus = np.round(np.arange(0.5, 0.996, 0.01), 3)
cov_rows = []
for tau in taus:
    acc_m = conf >= tau
    cov_rows.append(dict(tau=float(tau), coverage=float(acc_m.mean()), acc=float(correct[acc_m].mean()) if acc_m.any() else float("nan")))
ok = [r for r in cov_rows if r["acc"] >= TARGET_ACC]
tau = ok[0]["tau"] if ok else 0.99
cov_at_tau = [r for r in cov_rows if r["tau"] == tau][0]["coverage"]
log(f"\nabstention threshold tau = {tau} (smallest with accuracy >= {TARGET_ACC} among accepted): coverage {cov_at_tau:.3f}")

# ---------------- 5) cluster-level (what the product shows) ----------------
cl_rows = []
for dn in donors:
    for cl in np.unique(cluster[donor == dn]):
        m = (donor == dn) & (cluster == cl)
        if m.sum() < 10:
            continue
        pm = P_cal[m].mean(0)
        truth = np.bincount(y_idx[m], minlength=len(classes))
        cl_rows.append(dict(donor=dn, cluster=cl, n=int(m.sum()), pred=str(classes[pm.argmax()]), conf=float(pm.max()),
                            truth=str(classes[truth.argmax()]), purity=float(truth.max() / m.sum())))
cl_ok = np.array([r["pred"] == r["truth"] for r in cl_rows])
cl_conf = np.array([r["conf"] for r in cl_rows])
acc_acc = cl_ok[cl_conf >= tau].mean() if (cl_conf >= tau).any() else float("nan")
log(f"\ncluster-level ({len(cl_rows)} donor x cluster groups): accuracy {cl_ok.mean():.3f}; with abstention at tau: coverage {(cl_conf>=tau).mean():.3f}, accuracy of accepted {acc_acc:.3f}")
for r in cl_rows:
    if r["pred"] != r["truth"]:
        log(f"   miss: {r['donor']} cluster {r['cluster']} n={r['n']} pred {r['pred']} ({r['conf']:.2f}) truth {r['truth']} (purity {r['purity']:.2f})")

cm = confusion_matrix(y_idx, pred, labels=range(len(classes)))

# ---------------- 6) final model on all donors + export ----------------
final = Pipe(C_best).fit(L, y)
W = final.clf.coef_.astype(np.float32)
used = np.where((np.abs(W) > 1e-6).any(0))[0]
gene_names = np.asarray(a.var_names)[final.genes[used]]
Wu = W[:, used]
evidence = {str(c): [str(gene_names[i]) for i in np.argsort(-Wu[k])[:10] if Wu[k][i] > 0] for k, c in enumerate(classes)}
model = dict(
    name=f"cellulaML PBMC reference {'v2 (control cells only)' if CTRL_ONLY else 'v1'}", source=f"Kang et al. 2018 (GSE96583), 8 donors, {L.shape[0]:,} cells",
    classes=list(map(str, classes)), genes=list(map(str, gene_names)),
    std=final.sc.std[used].tolist(), clip=10.0, normalize="log1p_cp10k",
    W=Wu.tolist(), b=final.clf.intercept_.tolist(), temperature=T, abstain_below=float(tau),
    evidence=evidence,
    validation=dict(scheme="leave-one-donor-out", cell_accuracy=float(acc_all), balanced_accuracy=float(bacc),
                    ece_raw=ece(P_raw.max(1), correct), ece_calibrated=ece(conf, correct),
                    cluster_accuracy=float(cl_ok.mean()), cluster_coverage=float((cl_conf >= tau).mean())),
)
(OUT / f"reference_model{TAG}.json").write_text(json.dumps(model))
(OUT / f"reference_metrics{TAG}.json").write_text(json.dumps(dict(
    C=C_best, n_hvg=N_HVG, folds=fold_rows, oof=dict(accuracy=acc_all, balanced_accuracy=bacc), temperature=T,
    reliability=rel, coverage=cov_rows, tau=float(tau), clusters=cl_rows,
    confusion=dict(labels=list(map(str, classes)), matrix=cm.tolist()), genes_exported=int(len(used)),
), indent=1))
log(f"\nexported model: {len(used)} genes x {len(classes)} classes, {(OUT/f'reference_model{TAG}.json').stat().st_size/1e6:.2f} MB  (total {time.time()-t0:.0f}s)")
for c in classes:
    log(f"  {c:20s} evidence: {', '.join(evidence[str(c)][:6])}")
