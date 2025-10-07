-- Insert permissions
INSERT INTO permissions (id, name, display_name, description, resource) VALUES
('perm-admin-dashboard', 'admin.dashboard.view', 'Voir le tableau de bord admin', 'Accéder au tableau de bord d''administration', 'admin_dashboard'),
('perm-users-view', 'admin.users.view', 'Voir les utilisateurs', 'Voir la liste des utilisateurs', 'users'),
('perm-users-edit', 'admin.users.edit', 'Modifier les utilisateurs', 'Modifier les informations des utilisateurs', 'users'),
('perm-users-delete', 'admin.users.delete', 'Supprimer les utilisateurs', 'Supprimer des utilisateurs', 'users'),
('perm-tempo-view', 'admin.tempo.view', 'Voir les jours Tempo', 'Accéder à la gestion Tempo', 'tempo'),
('perm-tempo-edit', 'admin.tempo.edit', 'Modifier les jours Tempo', 'Modifier les jours Tempo', 'tempo'),
('perm-contrib-view', 'admin.contributions.view', 'Voir les contributions', 'Accéder aux contributions communautaires', 'contributions'),
('perm-contrib-review', 'admin.contributions.review', 'Valider les contributions', 'Approuver ou rejeter les contributions', 'contributions'),
('perm-offers-view', 'admin.offers.view', 'Voir les offres', 'Accéder à la gestion des offres', 'offers'),
('perm-offers-edit', 'admin.offers.edit', 'Modifier les offres', 'Modifier les offres énergétiques', 'offers'),
('perm-offers-delete', 'admin.offers.delete', 'Supprimer les offres', 'Supprimer des offres', 'offers'),
('perm-roles-view', 'admin.roles.view', 'Voir les rôles', 'Accéder à la gestion des rôles', 'roles'),
('perm-roles-edit', 'admin.roles.edit', 'Modifier les rôles', 'Modifier les permissions des rôles', 'roles')
ON CONFLICT (name) DO NOTHING;

-- Insert roles
INSERT INTO roles (id, name, display_name, description, is_system) VALUES
('role-admin', 'admin', 'Administrateur', 'Accès complet à toutes les fonctionnalités', true),
('role-moderator', 'moderator', 'Modérateur', 'Accès au tableau de bord, Tempo et contributions', true),
('role-visitor', 'visitor', 'Visiteur', 'Utilisateur standard sans accès administrateur', true)
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- Assign specific permissions to moderator role
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role-moderator', 'perm-admin-dashboard'),
('role-moderator', 'perm-tempo-view'),
('role-moderator', 'perm-tempo-edit'),
('role-moderator', 'perm-contrib-view'),
('role-moderator', 'perm-contrib-review')
ON CONFLICT DO NOTHING;

-- Migrate existing users to role system
UPDATE users
SET role_id = 'role-admin'
WHERE is_admin = true AND role_id IS NULL;

UPDATE users
SET role_id = 'role-visitor'
WHERE is_admin = false AND role_id IS NULL;
