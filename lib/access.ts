export type InterfaceFamily =
  | "md"
  | "finance"
  | "director"
  | "manager";

export type PermissionScope =
  | "own"
  | "assigned_projects"
  | "selected_projects"
  | "selected_accounts"
  | "company_wide";

export type PermissionGrant = {
  code: string;
  scope: PermissionScope;
  approvalLimit?: number;
  paymentLimit?: number;
};

export type AssignedPosition = {
  code: string;
  name: string;
  interfaceFamily: InterfaceFamily;
  parentPositionCode?: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  positions: AssignedPosition[];
  grants: PermissionGrant[];
};

export function getInterfaceFamilies(user: SessionUser): InterfaceFamily[] {
  return Array.from(new Set(user.positions.map((position) => position.interfaceFamily)));
}

export function hasPermission(user: SessionUser, permissionCode: string) {
  return user.grants.some((grant) => grant.code === permissionCode);
}

export function getPermission(user: SessionUser, permissionCode: string) {
  return user.grants.find((grant) => grant.code === permissionCode);
}

export function canApproveAmount(user: SessionUser, amount: number) {
  const grant = getPermission(user, "payments.approve");
  if (!grant) return false;
  if (grant.approvalLimit == null) return true;
  return amount <= grant.approvalLimit;
}

export function canPayAmount(user: SessionUser, amount: number) {
  const grant = getPermission(user, "payments.pay");
  if (!grant) return false;
  if (grant.paymentLimit == null) return true;
  return amount <= grant.paymentLimit;
}

export function canDelegatePermission(
  delegator: SessionUser,
  permissionCode: string,
  requestedScope: PermissionScope,
  requestedApprovalLimit?: number,
) {
  const grant = getPermission(delegator, permissionCode);
  if (!grant) return false;

  const scopeRank: Record<PermissionScope, number> = {
    own: 1,
    assigned_projects: 2,
    selected_projects: 3,
    selected_accounts: 3,
    company_wide: 4,
  };

  if (scopeRank[requestedScope] > scopeRank[grant.scope]) return false;

  if (
    requestedApprovalLimit != null &&
    grant.approvalLimit != null &&
    requestedApprovalLimit > grant.approvalLimit
  ) {
    return false;
  }

  return true;
}
