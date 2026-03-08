/**
 * matrix.js — Matrix operations for regression computations
 *
 * All matrices are represented as 2D arrays: matrix[row][col].
 * Vectors are 1D arrays. Column vectors are n×1 matrices.
 *
 * Namespace: SB.Matrix
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  // ============================================================
  // Construction
  // ============================================================

  /** Create an nRows × nCols matrix filled with `fill`. */
  function create(nRows, nCols, fill) {
    if (fill === undefined) fill = 0;
    var m = new Array(nRows);
    for (var i = 0; i < nRows; i++) {
      m[i] = new Array(nCols).fill(fill);
    }
    return m;
  }

  /** Alias: zero matrix. */
  function zeros(nRows, nCols) {
    return create(nRows, nCols, 0);
  }

  /** Identity matrix of size n. */
  function identity(n) {
    var m = zeros(n, n);
    for (var i = 0; i < n; i++) m[i][i] = 1;
    return m;
  }

  /** Convert a 1D array (vector) to an n×1 column matrix. */
  function fromColumn(vec) {
    return vec.map(function(v) { return [v]; });
  }

  /** Extract a column matrix (n×1) back to a 1D array. */
  function toColumn(mat) {
    return mat.map(function(row) { return row[0]; });
  }

  // ============================================================
  // Basic operations
  // ============================================================

  /** Transpose: rows become columns. */
  function transpose(A) {
    var rows = A.length;
    if (rows === 0 || !A[0]) return [];
    var cols = A[0].length;
    var T = create(cols, rows);
    for (var i = 0; i < rows; i++) {
      for (var j = 0; j < cols; j++) {
        T[j][i] = A[i][j];
      }
    }
    return T;
  }

  /** Matrix multiplication: A (m×k) × B (k×n) → (m×n). */
  function multiply(A, B) {
    var m = A.length;
    var k = A[0].length;
    var n = B[0].length;
    if (B.length !== k) throw new Error('Matrix multiply: inner dimensions mismatch (' + k + ' vs ' + B.length + ')');
    var C = create(m, n);
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < n; j++) {
        var sum = 0;
        for (var l = 0; l < k; l++) {
          sum += A[i][l] * B[l][j];
        }
        C[i][j] = sum;
      }
    }
    return C;
  }

  /** Matrix × vector: A (m×k) × v (k) → result (m). */
  function multiplyVec(A, v) {
    var m = A.length;
    var k = A[0].length;
    if (v.length !== k) throw new Error('Matrix-vector multiply: dimension mismatch (' + k + ' vs ' + v.length + ')');
    var result = new Array(m);
    for (var i = 0; i < m; i++) {
      var sum = 0;
      for (var l = 0; l < k; l++) {
        sum += A[i][l] * v[l];
      }
      result[i] = sum;
    }
    return result;
  }

  /** Element-wise addition: A + B. */
  function add(A, B) {
    var m = A.length, n = A[0].length;
    var C = create(m, n);
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < n; j++) {
        C[i][j] = A[i][j] + B[i][j];
      }
    }
    return C;
  }

  /** Element-wise subtraction: A - B. */
  function subtract(A, B) {
    var m = A.length, n = A[0].length;
    var C = create(m, n);
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < n; j++) {
        C[i][j] = A[i][j] - B[i][j];
      }
    }
    return C;
  }

  // ============================================================
  // Matrix inverse (Gauss-Jordan elimination with partial pivoting)
  // ============================================================

  /**
   * Invert a square matrix using Gauss-Jordan elimination.
   * Returns null if the matrix is singular.
   */
  function inverse(A) {
    var n = A.length;
    if (A[0].length !== n) throw new Error('inverse: matrix must be square');

    // Augment [A | I]
    var aug = create(n, 2 * n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        aug[i][j] = A[i][j];
      }
      aug[i][n + i] = 1;
    }

    for (var col = 0; col < n; col++) {
      // Partial pivoting: find max absolute value in column
      var maxVal = Math.abs(aug[col][col]);
      var maxRow = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > maxVal) {
          maxVal = Math.abs(aug[row][col]);
          maxRow = row;
        }
      }
      if (maxVal < 1e-15) return null; // singular

      // Swap rows
      if (maxRow !== col) {
        var tmp = aug[col];
        aug[col] = aug[maxRow];
        aug[maxRow] = tmp;
      }

      // Scale pivot row
      var pivot = aug[col][col];
      for (var j = 0; j < 2 * n; j++) {
        aug[col][j] /= pivot;
      }

      // Eliminate column in other rows
      for (var row = 0; row < n; row++) {
        if (row === col) continue;
        var factor = aug[row][col];
        for (var j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }

    // Extract right half
    var inv = create(n, n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        inv[i][j] = aug[i][n + j];
      }
    }
    return inv;
  }

  /**
   * Solve Ax = b for x, where A is square.
   * Returns null if singular.
   */
  function solve(A, b) {
    var Ainv = inverse(A);
    if (!Ainv) return null;
    return multiplyVec(Ainv, b);
  }

  // ============================================================
  // Cross products (common in regression)
  // ============================================================

  /** X'X: transpose(X) × X.  X is n×p → result is p×p. */
  function crossProduct(X) {
    var n = X.length;
    if (n === 0 || !X[0]) throw new Error('crossProduct: empty matrix');
    var p = X[0].length;
    var XtX = create(p, p);
    for (var i = 0; i < p; i++) {
      for (var j = i; j < p; j++) {
        var sum = 0;
        for (var k = 0; k < n; k++) {
          sum += X[k][i] * X[k][j];
        }
        XtX[i][j] = sum;
        XtX[j][i] = sum; // symmetric
      }
    }
    return XtX;
  }

  /** X'y: transpose(X) × y.  X is n×p, y is length n → result is length p. */
  function crossProductVec(X, y) {
    var n = X.length;
    if (n === 0 || !X[0]) throw new Error('crossProductVec: empty matrix');
    var p = X[0].length;
    var Xty = new Array(p);
    for (var j = 0; j < p; j++) {
      var sum = 0;
      for (var i = 0; i < n; i++) {
        sum += X[i][j] * y[i];
      }
      Xty[j] = sum;
    }
    return Xty;
  }

  /** Diagonal elements of a square matrix → array. */
  function diag(A) {
    var n = Math.min(A.length, A[0].length);
    var d = new Array(n);
    for (var i = 0; i < n; i++) d[i] = A[i][i];
    return d;
  }

  /** Create a diagonal matrix from a vector. */
  function diagMatrix(v) {
    var n = v.length;
    var D = zeros(n, n);
    for (var i = 0; i < n; i++) D[i][i] = v[i];
    return D;
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Matrix = {
    create: create,
    zeros: zeros,
    identity: identity,
    fromColumn: fromColumn,
    toColumn: toColumn,
    transpose: transpose,
    multiply: multiply,
    multiplyVec: multiplyVec,
    add: add,
    subtract: subtract,
    inverse: inverse,
    solve: solve,
    crossProduct: crossProduct,
    crossProductVec: crossProductVec,
    diag: diag,
    diagMatrix: diagMatrix,
  };

})();
