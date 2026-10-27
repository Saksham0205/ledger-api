import { ParseUUIDPipe } from '@nestjs/common';
import { InvalidAccountIdException } from './app.exception';

export const AccountIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new InvalidAccountIdException(),
});
