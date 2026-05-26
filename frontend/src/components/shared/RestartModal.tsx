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

/**
 * RestartModal — shown after a Headscale configuration change.
 *
 * Behaviour:
 * - DinD mode ON:  The backend has already triggered `docker restart`.
 *   The modal polls `GET /headscale/status` every 2 seconds until
 *   hs_connected === true (or a timeout is reached), then auto-closes.
 * - DinD mode OFF: The backend cannot restart Headscale automatically.
 *   A static notice is shown telling the operator to restart manually.
 *   The user dismisses the modal with a single OK button.
 */

import { CheckCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Modal, Result, Spin } from 'antd';
import { useEffect, useReducer } from 'react';
import { statusApi } from '@/api';
import { useTranslation } from '@/i18n';
import { useSystemStatusStore } from '@/lib/store';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

interface RestartModalProps {
  open: boolean;
  onClose: () => void;
}

interface RestartState {
  polling: boolean;
  connected: boolean;
  timedOut: boolean;
}

type RestartAction
  = | { type: 'reset' }
    | { type: 'start-polling' }
    | { type: 'connected' }
    | { type: 'timed-out' };

const initialRestartState: RestartState = {
  polling: false,
  connected: false,
  timedOut: false,
};

function restartReducer(state: RestartState, action: RestartAction): RestartState {
  switch (action.type) {
    case 'reset':
      return initialRestartState;
    case 'start-polling':
      return { polling: true, connected: false, timedOut: false };
    case 'connected':
      return { ...state, polling: false, connected: true };
    case 'timed-out':
      return { ...state, polling: false, timedOut: true };
    default:
      return state;
  }
}

export default function RestartModal({ open, onClose }: RestartModalProps) {
  const t = useTranslation();
  const { status } = useSystemStatusStore();
  const dindMode = status?.dind_mode ?? false;

  // ─── DinD polling state ──────────────────────────────────────────────────
  const [restartState, dispatch] = useReducer(restartReducer, initialRestartState);
  const { connected, timedOut } = restartState;

  useEffect(() => {
    if (!open) {
      dispatch({ type: 'reset' });
      return;
    }

    if (!dindMode)
      return; // static notice, no polling needed

    dispatch({ type: 'start-polling' });
    let closeTimer: ReturnType<typeof setTimeout> | null = null;

    const pollTimer = setInterval(async () => {
      try {
        const res = await statusApi.getHeadscaleStatus();
        if (res.running) {
          clearInterval(pollTimer);
          clearTimeout(timeoutTimer);
          dispatch({ type: 'connected' });
          // Auto-close after a brief success display
          closeTimer = setTimeout(onClose, 1500);
        }
      } catch {
        // server still restarting — ignore and keep polling
      }
    }, POLL_INTERVAL_MS);

    const timeoutTimer = setTimeout(() => {
      clearInterval(pollTimer);
      dispatch({ type: 'timed-out' });
    }, POLL_TIMEOUT_MS);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (closeTimer)
        clearTimeout(closeTimer);
    };
  }, [open, dindMode, onClose]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!dindMode) {
    return (
      <Modal
        open={open}
        title={t.restart.configSaved}
        onCancel={onClose}
        footer={(
          <Button type="primary" onClick={onClose}>
            {t.restart.ok}
          </Button>
        )}
        width={420}
      >
        <Result
          icon={<WarningOutlined style={{ color: '#faad14' }} />}
          title={t.restart.manualRestartRequired}
          subTitle={t.restart.manualRestartSubtitle}
          style={{ paddingBlock: 8 }}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title={t.restart.restarting}
      closable={timedOut}
      onCancel={timedOut ? onClose : undefined}
      footer={
        timedOut
          ? (
              <Button onClick={onClose}>{t.restart.close}</Button>
            )
          : connected ? null : null
      }
      width={420}
    >
      {connected
        ? (
            <Result
              icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              title={t.restart.restartSuccess}
              subTitle={t.restart.restartSuccessSubtitle}
              style={{ paddingBlock: 8 }}
            />
          )
        : timedOut
          ? (
              <Result
                icon={<WarningOutlined style={{ color: '#faad14' }} />}
                title={t.restart.restartTimeout}
                subTitle={t.restart.restartTimeoutSubtitle}
                style={{ paddingBlock: 8 }}
              />
            )
          : (
              <div className="text-center py-6">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
                <div className="mt-4 text-secondary">
                  {t.restart.waiting}
                </div>
              </div>
            )}
    </Modal>
  );
}
