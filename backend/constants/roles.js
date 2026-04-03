const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  CAMPAIGN_MANAGER: 'campaign_manager',
  VIEWER: 'viewer',
};

const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST];

module.exports = { ROLES, ASSIGNABLE_ROLES };
