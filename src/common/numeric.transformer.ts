import { ValueTransformer } from 'typeorm';

/** NUMERIC columns arrive from pg as strings; expose them as numbers with 2dp. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
