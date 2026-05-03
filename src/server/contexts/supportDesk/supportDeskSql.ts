export type SqlQuery = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: any[]
) => T[];
