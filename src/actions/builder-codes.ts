/**
 * ERC-8021 Builder Code Suffix
 *
 * Appended to every transaction's calldata so Base can attribute
 * on-chain activity to "proofwell" builder code.
 *
 * Format: [calldata][length_byte][code_ascii][schema_id_byte][8021_marker_16bytes]
 *
 * The 16-byte marker is: 0x00000000000000000000000000008021
 */

const MARKER_8021 = "00000000000000000000000000008021";

export function appendBuilderCode(
  calldata: `0x${string}`,
  code: string
): `0x${string}` {
  // Convert code to hex ASCII
  const codeHex = Buffer.from(code, "utf8").toString("hex");
  const codeLength = (codeHex.length / 2)
    .toString(16)
    .padStart(2, "0");

  // Schema ID: 0x00 (default)
  const schemaId = "00";

  // suffix = [length][code_ascii][schema_id][marker]
  const suffix = `${codeLength}${codeHex}${schemaId}${MARKER_8021}`;

  return `${calldata}${suffix}` as `0x${string}`;
}

/** Check if calldata already has an 8021 suffix */
export function hasBuilderCode(calldata: string): boolean {
  return calldata.endsWith(MARKER_8021);
}
