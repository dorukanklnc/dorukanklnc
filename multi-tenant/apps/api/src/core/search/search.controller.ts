import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type SearchQuery, searchQuerySchema, searchResponseSchema } from '@repo/contracts';
import { ApiZodQuery, ApiZodResponse, ValidQuery } from '../../platform/http/zod.js';
import type { Actor } from '../authorization/actor.js';
import { CurrentActor } from '../authorization/decorators.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiZodQuery(searchQuerySchema)
  @ApiZodResponse(200, searchResponseSchema)
  search(@CurrentActor() actor: Actor, @ValidQuery(searchQuerySchema) query: SearchQuery) {
    return this.searchService.search(actor, query);
  }
}
