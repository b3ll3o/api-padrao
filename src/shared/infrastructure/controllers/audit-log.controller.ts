// BDD: features/observabilidade.feature:Cenário: Logs de auditoria acessíveis via cursor
// SDD: .openspec/changes/observabilidade/design.md:REQ-AUDIT-READ-001
// ATDD: test/audit-log.e2e-spec.ts
// TDD: src/shared/infrastructure/controllers/audit-log.controller.spec.ts
//
// [REQ-AUDIT-READ-001] — `GET /audit-logs` expõe os logs de auditoria
// para administradores via cursor pagination. Diferente do OFFSET/LIMIT
// tradicional, o cursor usa o índice `createdAt` para fazer seek direto
// em > 10k rows sem degradação linear.
//
// [SEC-AUDIT-001] — Apenas usuários com a permissão `READ_AUDIT_LOG`
// podem listar. Por default, somente perfis administrativos têm essa
// permissão. Audit logs podem conter dados sensíveis (mesmo sanitizados)
// e não devem ser expostos a usuários comuns.
//
// [CACHE-AUDIT-001] — `Cache-Control: private, max-age=30` — logs são
// append-only, então uma janela curta de cache reduz carga no banco
// sem mascarar atualizações legítimas por mais que 30s.

import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissaoGuard } from '../../../auth/application/guards/permissao.guard';
import { TemPermissao } from '../../../auth/application/decorators/temPermissao.decorator';
import {
  AuditLogCursorPage,
  PrismaAuditLogRepository,
} from '../repositories/prisma-audit-log.repository';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT-auth')
@Controller('audit-logs')
@UseGuards(PermissaoGuard)
export class AuditLogController {
  constructor(private readonly auditLogRepository: PrismaAuditLogRepository) {}

  @TemPermissao('READ_AUDIT_LOG')
  @Get()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({
    summary: 'Listar logs de auditoria (cursor pagination)',
    description:
      'Retorna logs de auditoria usando cursor pagination (timestamp ISO-8601). ' +
      'Para a próxima página, envie o `nextCursor` retornado como parâmetro `cursor`. ' +
      'Quando `nextCursor` for `null`, não há mais páginas.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description:
      'ISO-8601 timestamp do último item da página anterior (retornado em nextCursor)',
    example: '2026-06-22T12:34:56.789Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Quantidade de itens por página (default 50, max 200)',
    example: 50,
  })
  @ApiQuery({
    name: 'acao',
    required: false,
    type: String,
    description: 'Filtra por código de ação (ex.: usuario.create)',
    example: 'usuario.create',
  })
  @ApiQuery({
    name: 'usuarioId',
    required: false,
    type: Number,
    description: 'Filtra por ID do usuário que executou a ação',
    example: 42,
  })
  @ApiQuery({
    name: 'recurso',
    required: false,
    type: String,
    description: 'Filtra por recurso (ex.: usuario:42)',
    example: 'usuario:42',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de logs retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        nextCursor: {
          type: 'string',
          nullable: true,
          description: 'Cursor ISO-8601 da próxima página (null se fim)',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cursor inválido' })
  @ApiResponse({
    status: 403,
    description: 'Usuário sem permissão READ_AUDIT_LOG',
  })
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('acao') acao?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('recurso') recurso?: string,
  ): Promise<AuditLogCursorPage> {
    // [SEC-AUDIT-INPUT-001] — Validação de entrada antes de chegar ao
    // Prisma. ISO-8601 malformado causa `RangeError` no `new Date()`.
    if (cursor !== undefined) {
      const parsed = new Date(cursor);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(
          `Cursor inválido: "${cursor}" não é um ISO-8601 válido`,
        );
      }
    }

    const parsedLimit =
      limit !== undefined && limit !== '' ? Number(limit) : undefined;
    if (
      parsedLimit !== undefined &&
      (!Number.isFinite(parsedLimit) ||
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1)
    ) {
      throw new BadRequestException(
        `Limit inválido: "${limit}" deve ser inteiro >= 1`,
      );
    }

    const parsedUsuarioId =
      usuarioId !== undefined && usuarioId !== ''
        ? Number(usuarioId)
        : undefined;
    if (
      parsedUsuarioId !== undefined &&
      (!Number.isFinite(parsedUsuarioId) ||
        !Number.isInteger(parsedUsuarioId) ||
        parsedUsuarioId < 1)
    ) {
      throw new BadRequestException(
        `usuarioId inválido: "${usuarioId}" deve ser inteiro >= 1`,
      );
    }

    return this.auditLogRepository.findMany({
      cursor,
      limit: parsedLimit,
      acao,
      usuarioId: parsedUsuarioId,
      recurso,
    });
  }
}
