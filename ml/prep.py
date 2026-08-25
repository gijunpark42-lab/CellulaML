"""Shared preprocessing for the reference model (mirrors what the browser will do at inference)."""
from __future__ import annotations

import numpy as np
import anndata as ad
from scipy import sparse

LABEL = "cell_type"
DONOR = "replicate"
CLUSTER = "seurat_clusters"
CLIP = 10.0


def load(path):
    a = ad.read_h5ad(path)
    X = sparse.csr_matrix(a.X, dtype=np.float32)
    return a, X


def lognorm(X: sparse.csr_matrix, target=1e4) -> sparse.csr_matrix:
    """counts -> log1p(CP10k). Row-wise, keeps sparsity."""
    X = X.copy()
    tot = np.asarray(X.sum(1)).ravel()
    tot[tot == 0] = 1
    X = sparse.diags((target / tot).astype(np.float32)) @ X
    X.data = np.log1p(X.data)
    return sparse.csr_matrix(X, dtype=np.float32)


def gene_filter(X: sparse.csr_matrix, min_frac=0.01) -> np.ndarray:
    """keep genes detected in at least min_frac of cells (computed on TRAIN only)."""
    det = np.asarray((X > 0).mean(0)).ravel()
    return np.where(det >= min_frac)[0]


class Scaler:
    """Divide by per-gene std (train), clip. No mean-centering so the matrix stays sparse."""

    def fit(self, X):
        mean = np.asarray(X.mean(0)).ravel()
        sq = np.asarray(X.multiply(X).mean(0)).ravel()
        self.std = np.sqrt(np.maximum(sq - mean**2, 1e-8)).astype(np.float32)
        self.std[self.std < 1e-4] = 1.0
        return self

    def transform(self, X):
        X = sparse.csr_matrix(X @ sparse.diags(1.0 / self.std), dtype=np.float32)
        X.data = np.minimum(X.data, CLIP)
        return X
