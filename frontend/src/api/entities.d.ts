import type { DNSRecordType } from '@/lib/enums';

// ─── Core response wrappers ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
  error?: string;
}

export interface PaginatedData<T = unknown> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
  page_count: number;
}

// ─── model.User ───────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email?: string;
  display_name?: string;
  headscale_name?: string;
  provider?: string;
  provider_id?: string;
  profile_pic_url?: string;
  guide_tour_seen_at?: string | null;
  group_id?: number;
  group?: Group;
  totp_enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.Group ─────────────────────────────────────────────────────────────

export interface Group {
  id: number;
  name: string;
  permissions?: Permission[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.Permission ────────────────────────────────────────────────────────

export interface Permission {
  id: number;
  name: string;
  code: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.DNSRecord ─────────────────────────────────────────────────────────

export interface DNSRecord {
  id: number;
  name: string;
  type: DNSRecordType;
  value: string;
  comment?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── model.Resource ──────────────────────────────────────────────────────────

export interface Resource {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
  creator_id?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.OauthClient ───────────────────────────────────────────────────────

export interface OauthClient {
  id: number;
  name: string;
  client_id?: string;
  redirect_uris?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.ACLPolicy ─────────────────────────────────────────────────────────

export interface ACLPolicyRecord {
  id: number;
  content?: string;
  version?: number;
  created_by?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── model.ACLPolicyStructure ────────────────────────────────────────────────

export interface ACLRuleMeta {
  name?: string;
  open?: boolean;
}

export interface ACLRule {
  '#ha-meta'?: ACLRuleMeta;
  'action': string;
  'src': string[];
  'dst': string[];
}

export interface ACLTest {
  src: string;
  accept?: string[];
  deny?: string[];
}

export interface ACLPolicyStructure {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: ACLRule[];
  ssh?: unknown[];
  tests?: ACLTest[];
}

// ─── model.ParsedACLRule ─────────────────────────────────────────────────────

export interface ParsedACLRule {
  id: number;
  name?: string;
  action: string;
  sources: string[];
  destinations: string[];
  resolved_sources?: string[];
  resolved_dests?: string[];
}

// ─── services.HeadscaleUser ──────────────────────────────────────────────────

export interface HeadscaleUser {
  id: number;
  name: string;
  display_name?: string;
  email?: string;
  profile_pic_url?: string;
  provider?: string;
  provider_id?: string;
  created_at?: string;
}

// ─── services.HeadscaleAuthKey ───────────────────────────────────────────────

export interface HeadscaleAuthKey {
  id: number;
  key: string;
  user: string;
  reusable: boolean;
  ephemeral: boolean;
  used?: boolean;
}

// ─── services.HeadscaleMachine ───────────────────────────────────────────────

export interface HeadscaleMachine {
  id: number;
  name: string;
  given_name?: string;
  ip_addresses?: string[];
  online?: boolean;
  last_seen?: string;
  expiry?: string;
  created_at?: string;
  register_method?: string;
  tags?: string[];
  available_routes?: string[];
  approved_routes?: string[];
  subnet_routes?: string[];
  user?: HeadscaleUser;
  pre_auth_key?: HeadscaleAuthKey;
}
