/** Model card registry: one entry per trained version. Add a new entry whenever a model is (re)trained. */

export interface TestResult {
  dataset: string;
  whyItIsHard: string;
  result: string;
}

export interface ModelCard {
  version: string;
  status: "shipped" | "retired" | "experiment";
  date: string;
  file?: string;
  algorithm: string;
  preprocessing: string;
  training: { dataset: string; cells: string; donors: string; classes: string; hyperparams: string };
  validation: { scheme: string; rows: [string, string][] };
  tests: TestResult[];
  weaknesses: string[];
  changes: string;
}

export const MODELS: ModelCard[] = [
  {
    version: "v2",
    status: "shipped",
    date: "2026-08-24",
    file: "/models/pbmc_v2.json",
    algorithm: "L1-regularized multinomial logistic regression (scikit-learn saga), temperature-scaled softmax, abstain below a confidence threshold",
    preprocessing: "log1p(CP10k) -> 3,000 highly variable genes chosen on training folds -> divide by per-gene std, clip at 10",
    training: {
      dataset: "Kang et al. 2018 (GSE96583), control (unstimulated) cells only",
      cells: "12,315",
      donors: "8",
      classes: "8: CD4 T, CD8 T, B, NK, CD14+ Mono, FCGR3A+ Mono, Dendritic, Megakaryocytes",
      hyperparams: "C = 0.3 (donor-grouped 4-fold CV on log-loss), 1,905 genes with non-zero weight, T = 1.002, abstain below 0.59",
    },
    validation: {
      scheme: "Leave-one-donor-out (8 folds); temperature fit on out-of-fold logits",
      rows: [
        ["Cell-level accuracy", "0.963 (per donor 0.926-0.978)"],
        ["Balanced accuracy", "0.919"],
        ["Calibration error (ECE)", "0.0047 -> 0.0046"],
        ["Abstention 0.59", "97% accuracy at 98% coverage (0.74: 98%/96%, 0.90: 99%/90%)"],
        ["Cluster-level", "77 / 77 donor x cluster groups"],
      ],
    },
    tests: [
      {
        dataset: "pbmc3k (10x Genomics, 2016, healthy donor) - 2,638 and 600 cells",
        whyItIsHard: "different lab, platform and year; labels hidden",
        result: "6 of 8 clusters called, all correct; abstained on CD8 T and Megakaryocytes (both would have been wrong). Cell-level 0.87.",
      },
      {
        dataset: "Stephenson et al. 2021 (COVID-19 PBMC), 5,000-cell subsample, 45 fine labels mapped to the 8 types",
        whyItIsHard: "disease state, 3 sites, many cell types the model has never seen",
        result: "In-vocabulary clusters: 19 of 22 called correctly, 3 abstained. Out-of-vocabulary: 4 abstained, 5 called (MAIT/gdT as CD4 T, pDC as Dendritic, plasmablast as CD4 T). Cell-level 0.79.",
      },
    ],
    weaknesses: [
      "CD8 T is the weak class: naive/effector-memory CD8 called CD4 T with high confidence on COVID data (small CD8 class in the reference, CD4/CD8 share most markers).",
      "Abstention catches ambiguity between known types only; unseen types (platelets, plasmablasts, HSCs) can get a confident wrong label. No out-of-distribution detection yet.",
      "Megakaryocyte class is unreliable: the reference label is contaminated with red-blood-cell genes (HBA1/HBB).",
    ],
    changes: "Dropped the IFN-beta stimulated half of the reference; interferon genes (ISG15) disappeared from the CD4 T evidence and confidence on unstimulated data recovered.",
  },
  {
    version: "v1",
    status: "retired",
    date: "2026-08-24",
    algorithm: "Same as v2",
    preprocessing: "Same as v2",
    training: {
      dataset: "Kang et al. 2018 (GSE96583), control + IFN-beta stimulated cells",
      cells: "24,673",
      donors: "8",
      classes: "8 (same as v2)",
      hyperparams: "C = 0.3, 2,426 genes with non-zero weight, T = 1.148, abstain below 0.91",
    },
    validation: {
      scheme: "Leave-one-donor-out (8 folds)",
      rows: [
        ["Cell-level accuracy", "0.965 (per donor 0.931-0.982)"],
        ["Balanced accuracy", "0.933"],
        ["Calibration error (ECE)", "0.0085 -> 0.0027"],
        ["Abstention 0.91", "99% accuracy at 90% coverage"],
        ["Cluster-level", "90 / 90"],
      ],
    },
    tests: [
      {
        dataset: "pbmc3k",
        whyItIsHard: "unstimulated cells; reference was half stimulated",
        result: "Only 1-2 of 8 clusters called (correct), 6-7 abstained: too timid to be useful. Cell-level 0.86.",
      },
    ],
    weaknesses: [
      "Interferon-response genes (ISG15) among the CD4 T evidence - an artifact of the stimulated cells.",
      "Confidence collapses on unstimulated data (monocytes 0.59), so most clusters abstain.",
    ],
    changes: "First donor-validated model.",
  },
  {
    version: "v0 (warm-up)",
    status: "experiment",
    date: "2026-08-24",
    algorithm: "L1 multinomial logistic regression, no calibration, no abstention",
    preprocessing: "log-normalized values standardized on the training split",
    training: {
      dataset: "pbmc68k_reduced (scanpy sample data)",
      cells: "700",
      donors: "1",
      classes: "10",
      hyperparams: "C = 10 by 5-fold CV; all 765 genes used",
    },
    validation: {
      scheme: "Random stratified 70/30 split (single donor - no donor-level validation possible)",
      rows: [
        ["Held-out accuracy", "0.838"],
        ["Balanced accuracy", "0.740"],
        ["Calibration", "over-confident: cells at 0.86 confidence were right 69% of the time"],
      ],
    },
    tests: [],
    weaknesses: ["Single donor, tiny data; CD4 subtypes indistinguishable. Built only to learn the pipeline."],
    changes: "Never shipped.",
  },
];
