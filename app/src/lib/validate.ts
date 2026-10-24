import type { z } from "zod";

/** Turns a zod schema into a server-function validator that throws a readable one-line message. */
export function v<T extends z.ZodTypeAny>(schema: T) {
  return (input: unknown): z.output<T> => {
    const r = schema.safeParse(input);
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join("; "));
    return r.data;
  };
}
