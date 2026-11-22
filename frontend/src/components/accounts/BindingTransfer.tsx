/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { AccountNetworkBinding } from '@/api/account.types';
import type { NetworkIdentity } from '@/api/entities';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { Button, message, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { accountApi, networkIdentityApi } from '@/api';
import { useTranslation } from '@/i18n/index';

const { Text } = Typography;

interface Props {
  accountId: number;
  bindings: AccountNetworkBinding[];
  /** Every identity in the tailnet; the picker hides the ones already bound. */
  identities: NetworkIdentity[];
  onUpdated: () => void;
}

/**
 * Links tailnet identities to a panel account.
 *
 * A headscale user belongs to at most one account and an account has at most one
 * primary identity. Both rules live in the backend inside a transaction, so this
 * component only has to express the intent; it never has to reconcile state.
 */
export default function BindingTransfer({ accountId, bindings, identities, onUpdated }: Props) {
  const t = useTranslation();
  const pa = t.panelAccounts;
  const [busy, setBusy] = useState(false);

  const boundIds = new Set(bindings.map((binding) => binding.hs_user_id));
  const available = identities.filter(
    (identity) => !boundIds.has(identity.hs_user_id) && !identity.tagged,
  );

  const identityById = new Map(identities.map((identity) => [identity.hs_user_id, identity]));

  const labelFor = (hsUserId: number) => {
    const identity = identityById.get(hsUserId);
    return identity?.display_name || identity?.name || `#${hsUserId}`;
  };

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      message.success(successMessage);
      onUpdated();
    } catch (error: unknown) {
      message.error((error as Error)?.message || pa.toast.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-12px">
        <Text strong>{pa.detail.binding.title}</Text>
      </div>

      {bindings.length === 0
        ? <Text type="secondary">{pa.detail.binding.noBindings}</Text>
        : (
            <Table
              rowKey="id"
              dataSource={bindings}
              size="small"
              pagination={false}
              columns={[
                {
                  title: pa.detail.binding.hsUserName,
                  dataIndex: 'hs_user_id',
                  key: 'hs_user_id',
                  render: (value: number) => labelFor(value),
                },
                {
                  title: pa.detail.binding.primary,
                  key: 'primary',
                  width: 160,
                  render: (_: unknown, record: AccountNetworkBinding) =>
                    record.is_primary
                      ? (
                          <Tag icon={<StarFilled />} color="gold">
                            {pa.detail.binding.primary}
                          </Tag>
                        )
                      : (
                          <Button
                            size="small"
                            type="link"
                            icon={<StarOutlined />}
                            loading={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  accountApi.setPrimaryBinding({
                                    id: accountId,
                                    hsUserId: record.hs_user_id,
                                  }),
                                pa.toast.primaryBindingSuccess,
                              )}
                          >
                            {pa.detail.binding.primary}
                          </Button>
                        ),
                },
                {
                  title: '',
                  key: 'actions',
                  width: 90,
                  render: (_: unknown, record: AccountNetworkBinding) => (
                    <Button
                      size="small"
                      danger
                      type="link"
                      loading={busy}
                      onClick={() =>
                        void run(
                          () => networkIdentityApi.unbind({ hsUserId: record.hs_user_id }),
                          pa.toast.bindingUpdateSuccess,
                        )}
                    >
                      {pa.detail.binding.editBindings}
                    </Button>
                  ),
                },
              ]}
            />
          )}

      {available.length > 0 && (
        <Space wrap className="mt-12px">
          {available.map((identity) => (
            <Button
              key={identity.hs_user_id}
              size="small"
              loading={busy}
              onClick={() =>
                void run(
                  () =>
                    networkIdentityApi.bind({
                      hsUserId: identity.hs_user_id,
                      account_id: accountId,
                      primary: bindings.length === 0,
                    }),
                  pa.toast.bindingUpdateSuccess,
                )}
            >
              +
              {' '}
              {identity.display_name || identity.name}
            </Button>
          ))}
        </Space>
      )}
    </div>
  );
}
