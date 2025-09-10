-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- Insert default profiles
INSERT INTO "Perfil" (nome, codigo, descricao) VALUES
('Usuário', 'USUARIO', 'Perfil padrão para usuários comuns'),
('Administrador', 'ADMIN', 'Perfil com acesso total ao sistema');

-- Insert permissions
INSERT INTO "Permissao" (nome, codigo, descricao) VALUES
('Criar Perfil', 'CREATE_PERFIL', 'Permite criar novos perfis'),
('Ler Perfis', 'READ_PERFIS', 'Permite listar todos os perfis'),
('Ler Perfil por ID', 'READ_PERFIL_BY_ID', 'Permite buscar um perfil específico por ID'),
('Ler Perfil por Nome', 'READ_PERFIL_BY_NOME', 'Permite buscar perfis por nome'),
('Atualizar Perfil', 'UPDATE_PERFIL', 'Permite atualizar perfis existentes'),
('Deletar Perfil', 'DELETE_PERFIL', 'Permite remover perfis'),
('Criar Permissão', 'CREATE_PERMISSAO', 'Permite criar novas permissões'),
('Ler Permissões', 'READ_PERMISSOES', 'Permite listar todas as permissões'),
('Ler Permissão por ID', 'READ_PERMISSAO_BY_ID', 'Permite buscar uma permissão específica por ID'),
('Ler Permissão por Nome', 'READ_PERMISSAO_BY_NOME', 'Permite buscar permissões por nome'),
('Atualizar Permissão', 'UPDATE_PERMISSAO', 'Permite atualizar permissões existentes'),
('Deletar Permissão', 'DELETE_PERMISSAO', 'Permite remover permissões'),
('Ler Usuário por ID', 'READ_USUARIO_BY_ID', 'Permite buscar um usuário específico por ID');

-- Associate all permissions with the 'ADMIN' profile
INSERT INTO "_PerfilToPermissao" ("A", "B")
SELECT p.id, perm.id
FROM "Perfil" p, "Permissao" perm
WHERE p.codigo = 'ADMIN';

-- Associate specific permissions with the 'USUARIO' profile
INSERT INTO "_PerfilToPermissao" ("A", "B")
SELECT p.id, perm.id
FROM "Perfil" p, "Permissao" perm
WHERE p.codigo = 'USUARIO' AND perm.codigo IN (
    'READ_PERFIS',
    'READ_PERFIL_BY_ID',
    'READ_PERFIL_BY_NOME',
    'READ_USUARIO_BY_ID'
);
