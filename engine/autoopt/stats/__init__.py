"""Statistics package, mapped module by module onto the BMAT202L syllabus.

    data           loading and derived columns
    descriptive    M1  central tendency, dispersion, skewness, kurtosis
    randomvars     M2  joint/marginal/conditional distributions, moments, MGF
    regression     M3  correlation, partial correlation, multiple regression
    distributions  M4  distribution fitting and goodness of fit
    testing        M5  hypothesis testing machinery
                   M6  CRD, RBD, three-way ANOVA, Latin Square, Tukey
    reliability    M7  series and parallel systems, hazard, maintainability

Every function takes a DataFrame and returns a DataFrame or a dataclass, so the
notebook and the report renderer read the same results.
"""

from __future__ import annotations

from . import descriptive, distributions, randomvars, regression, reliability, testing
from .data import CATEGORY_ORDER, METHOD_ORDER, Dataset, latin_square_sample, load

__all__ = [
    "CATEGORY_ORDER",
    "METHOD_ORDER",
    "Dataset",
    "descriptive",
    "distributions",
    "latin_square_sample",
    "load",
    "randomvars",
    "regression",
    "reliability",
    "testing",
]
