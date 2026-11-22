// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

export type ConfigOwner = 'managed' | 'readonly' | 'passthrough';
export type ConfigTier = 'api' | 'hotfile' | 'configfile';
export type ConfigKind = 'string' | 'bool' | 'int' | 'duration' | 'strings' | 'string_map';
export type ConfigOwnershipMode = 'managed' | 'observed';

export interface ConfigField {
  key: string;
  value?: unknown;
  owner: ConfigOwner;
  tier: ConfigTier;
  kind: ConfigKind;
  section: string;
  secret: boolean;
  note?: string;
}

export interface ConfigDriftEntry {
  key: string;
  in_file?: unknown;
  expected?: unknown;
  secret: boolean;
}

export interface ConfigDriftReport {
  drift?: ConfigDriftEntry[];
  missing?: string[];
  unmodelled?: string[];
}

export interface HeadscaleConfigView {
  mode: ConfigOwnershipMode;
  configured: boolean;
  path: string;
  fields: ConfigField[];
  drift?: ConfigDriftReport;
  unmodelled?: string[];
}

export interface ConfigChange {
  key: string;
  from?: unknown;
  to?: unknown;
  bootstrap?: boolean;
}

export interface ConfigBlockedWrite {
  key: string;
  reason: string;
}

export interface ConfigRestartOutcome {
  performed?: boolean;
  requires_manual?: boolean;
  manual_hint?: string;
  reason?: string;
}

export interface UpdateConfigReq {
  values: Record<string, unknown>;
  restart?: boolean;
}

export interface UpdateConfigRes {
  message?: string;
  changes?: ConfigChange[];
  blocked?: ConfigBlockedWrite[];
  restart?: ConfigRestartOutcome;
}

export interface PreviewConfigRes {
  yaml?: string;
  changes?: ConfigChange[];
  blocked?: ConfigBlockedWrite[];
}

export interface UpdateModeReq {
  mode: ConfigOwnershipMode;
}

export interface RunningConfigRes {
  yaml: string;
  docs: boolean;
}

export type GetConfigRes = HeadscaleConfigView;
