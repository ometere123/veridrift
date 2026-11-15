import { isDeepStrictEqual } from "node:util";

export const statuses = ["supported", "contradicted", "unresolved"];
export const claimIds = ["A", "B", "C"];

export function assessmentSchema(withConfidence) {
  const properties = {
    status: { type: "string", enum: statuses },
    citations: { type: "array", items: { type: "string" } },
  };
  if (withConfidence) properties.confidence = { type: "integer", minimum: 0, maximum: 100 };
  function object(fields) {
    return { type: "object", properties: fields, required: Object.keys(fields), additionalProperties: false };
  }
  const assessment = object(properties);
  return object({
    claims: object(Object.fromEntries(claimIds.map(id => [id, assessment]))),
    note: { type: "string" },
  });
}

const exact = (actual, expected) => actual && typeof actual === "object" &&
  !Array.isArray(actual) && isDeepStrictEqual(Object.keys(actual).sort(), [...expected].sort());

export function parseAssessment(text, withConfidence = true) {
  const out = JSON.parse(text);
  if (!exact(out, ["claims", "note"]) || !exact(out.claims, claimIds) || typeof out.note !== "string")
    throw new Error("assessment envelope");
  for (const id of claimIds) {
    const result = out.claims[id];
    const fields = withConfidence ? ["status", "citations", "confidence"] : ["status", "citations"];
    if (!exact(result, fields) || !statuses.includes(result.status) || !Array.isArray(result.citations) ||
      !result.citations.every(ref => typeof ref === "string" && ref.trim().length > 0) ||
      new Set(result.citations).size !== result.citations.length)
      throw new Error("invalid claim " + id);
    if (withConfidence && (!Number.isInteger(result.confidence) || result.confidence < 0 || result.confidence > 100))
      throw new Error("invalid confidence " + id);
  }
  return out;
}

