export enum UserProvider {
  Headscale = 'headscale',
  Local = 'local',
  OIDC = 'oidc',
}

export enum ThemeMode {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export enum ACLAction {
  Accept = 'accept',
  Deny = 'deny',
}

export enum DNSRecordType {
  A = 'A',
  AAAA = 'AAAA',
}
