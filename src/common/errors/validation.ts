import { ValidationError } from '@nestjs/common';
import { AppException, ErrorCode } from './app.exception';

export interface FieldError {
  field: string;
  message: string;
}

const FIELD_CODES: Record<string, ErrorCode> = {
  amount: 'INVALID_AMOUNT',
  type: 'INVALID_TRANSACTION_TYPE',
  page: 'INVALID_PAGINATION',
  limit: 'INVALID_PAGINATION',
};

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Turns class-validator errors into the API's flat, consistent error shape. */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const details = flatten(errors);
  const code = FIELD_CODES[details[0]?.field ?? ''] ?? 'VALIDATION_ERROR';
  return new AppException(400, code, 'Request validation failed', details);
}
