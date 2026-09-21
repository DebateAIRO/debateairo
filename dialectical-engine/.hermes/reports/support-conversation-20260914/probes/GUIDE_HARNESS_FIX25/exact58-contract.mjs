function fail(code) {
  throw new Error(code);
}

function canonicalBytes(value) {
  return JSON.stringify(value);
}

export function validateExactGuide58Identity(matrix,canonicalRows,ownerRows) {
  if (!Array.isArray(matrix) || !Array.isArray(canonicalRows) || !Array.isArray(ownerRows)
    || matrix.length !== 58 || canonicalRows.length !== 54 || ownerRows.length !== 4) {
    fail("GUIDE_ROW_PROOF_MATRIX_COUNT_MISMATCH");
  }
  const sequences=matrix.map(row => row?.sequence);
  if (sequences.some((sequence,index) => sequence !== index+1)
    || new Set(sequences).size !== 58) {
    fail("GUIDE_ROW_PROOF_MATRIX_IDENTITY_MISMATCH");
  }
  if (canonicalBytes(matrix.slice(0,54)) !== canonicalBytes(canonicalRows)
    || canonicalBytes(matrix.slice(54)) !== canonicalBytes(ownerRows)
    || canonicalBytes(matrix) !== canonicalBytes([...canonicalRows,...ownerRows])) {
    fail("GUIDE_ROW_PROOF_MATRIX_IDENTITY_MISMATCH");
  }
  const ownerContract=[
    [55,"product-identity","en","NONE",null],
    [56,"product-identity","ro","NONE",null],
    [57,"account-access","en","ALLOW_CLOSED","sign-in"],
    [58,"account-access","ro","ALLOW_CLOSED","sign-up"]
  ];
  if (ownerRows.some((row,index) => {
    const [sequence,sourceId,language,actionPolicy,requiredActionId]=ownerContract[index];
    return row.sequence !== sequence || row.kind !== "OWNER_REGRESSION"
      || row.language !== language || row.actionPolicy !== actionPolicy
      || row.requiredActionId !== requiredActionId
      || !Array.isArray(row.expectedSourceIds) || row.expectedSourceIds.length !== 1
      || row.expectedSourceIds[0] !== sourceId;
  })) {
    fail("GUIDE_ROW_PROOF_OWNER_IDENTITY_MISMATCH");
  }
  return true;
}
