import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { AppException, ErrorCode } from '../errors/app.exception';
import {
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  getPgErrorCode,
} from '../errors/db-errors';

export interface ErrorBody {
  statusCode: number;
  error: string;
  code: ErrorCode;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

export interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { status, code, message, details } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      code,
      message,
      ...(details !== undefined && { details }),
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }

  normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    const pgCode = getPgErrorCode(exception);
    if (pgCode === PG_UNIQUE_VIOLATION) {
      return { status: 409, code: 'DUPLICATE_TRANSACTION', message: 'Resource already exists' };
    }
    if (pgCode === PG_FOREIGN_KEY_VIOLATION) {
      return { status: 404, code: 'ACCOUNT_NOT_FOUND', message: 'Referenced account not found' };
    }
    if (pgCode === PG_CHECK_VIOLATION) {
      return {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Data violates a database constraint',
      };
    }

    // Body-parser failures (malformed JSON) arrive as plain errors with a type/status.
    const parserError = exception as { type?: string } | null;
    if (parserError?.type === 'entity.parse.failed') {
      return {
        status: 400,
        code: 'INVALID_REQUEST_BODY',
        message: 'Request body is not valid JSON',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) {
        return { status, code: 'NOT_FOUND', message: 'Route not found' };
      }
      return { status, code: 'INVALID_REQUEST_BODY', message: exception.message };
    }

    return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
}
