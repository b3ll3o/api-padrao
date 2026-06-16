import { UsuarioEmpresa } from './usuario-empresa.entity';
import { Perfil } from '../../../perfis/domain/entities/perfil.entity';
import { Empresa } from '../../../empresas/domain/entities/empresa.entity';

// TDD: features/empresas.feature:Cenário: Vincular usuário a empresa com perfis

describe('UsuarioEmpresa', () => {
  it('deve aceitar payload parcial via construtor (Object.assign)', () => {
    const ue = new UsuarioEmpresa({
      id: 1,
      usuarioId: 10,
      empresaId: 'uuid-empresa',
    });

    expect(ue.id).toBe(1);
    expect(ue.usuarioId).toBe(10);
    expect(ue.empresaId).toBe('uuid-empresa');
  });

  it('deve aceitar array de Perfis vinculados', () => {
    const perfil = new Perfil();
    perfil.id = 1;
    perfil.nome = 'Admin';
    perfil.codigo = 'ADMIN';
    perfil.descricao = 'Administrador';
    perfil.empresaId = 'uuid-empresa';
    perfil.ativo = true;
    perfil.createdAt = new Date();
    perfil.updatedAt = new Date();

    const ue = new UsuarioEmpresa({
      id: 1,
      usuarioId: 10,
      empresaId: 'uuid-empresa',
      perfis: [perfil],
    });

    expect(ue.perfis).toHaveLength(1);
    expect(ue.perfis![0].codigo).toBe('ADMIN');
  });

  it('deve aceitar Empresa relacionada (join eager loaded)', () => {
    const empresa = new Empresa({
      id: 'uuid-x',
      nome: 'Empresa X',
      responsavelId: 1,
      ativo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ue = new UsuarioEmpresa({
      id: 1,
      usuarioId: 10,
      empresaId: 'uuid-x',
      empresa,
    });

    expect(ue.empresa?.nome).toBe('Empresa X');
  });

  it('deve aceitar perfis e empresa undefined (sem eager loading)', () => {
    const ue = new UsuarioEmpresa({
      id: 1,
      usuarioId: 10,
      empresaId: 'uuid-x',
    });

    expect(ue.perfis).toBeUndefined();
    expect(ue.empresa).toBeUndefined();
  });
});
