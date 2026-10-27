import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 10 }) limit: number;
  @ApiProperty({ example: 42 }) total_records: number;
  @ApiProperty({ example: 5 }) total_pages: number;
}

export function buildPagination(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total_records: total, total_pages: Math.ceil(total / limit) };
}
