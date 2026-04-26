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

import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Result, Spin } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { statusApi } from '@/api';
import { useSystemStatusStore } from '@/lib/store';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

interface RestartModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RestartModal({ open, onClose }: RestartModalProps) {
  const { status } = useSystemStatusStore();
  const dindMode = status?.dind_mode ?? false;

  // ─── DinD polling state ──────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [connected, setConnected] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stopPolling();
      setPolling(false);
      setConnected(false);
      setTimedOut(false);
      return;
    }

    if (!dindMode) return; // static notice, no polling needed

    setPolling(true);
    setConnected(false);
    setTimedOut(false);

    pollRef.current = setInterval(async () => {
      try {
        const res = await statusApi.getHeadscaleStatus();
        if (res.running) {
          stopPolling();
          setPolling(false);
          setConnected(true);
          // Auto-close after a brief success display
          setTimeout(onClose, 1500);
        }
      } catch {
        // server still restarting — ignore and keep polling
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setPolling(false);
      setTimedOut(true);
    }, POLL_TIMEOUT_MS);

    return stopPolling;
  }, [open, dindMode]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!dindMode) {
    return (
      <Modal
        open={open}
        title="Configuration Saved"
        onCancel={onClose}
        footer={
          <Button type="primary" onClick={onClose}>
            OK
          </Button>
        }
        width={420}
      >
        <Result
          icon={<WarningOutlined style={{ color: '#faad14' }} />}
          title="Manual Restart Required"
          subTitle="The configuration has been saved. Restart the Headscale server manually for the changes to take effect."
          style={{ paddingBlock: 8 }}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Restarting Headscale"
      closable={timedOut}
      onCancel={timedOut ? onClose : undefined}
      footer={
        timedOut ? (
          <Button onClick={onClose}>Close</Button>
        ) : connected ? null : null
      }
      width={420}
    >
      {connected ? (
        <Result
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="Headscale is Online"
          subTitle="The server restarted successfully."
          style={{ paddingBlock: 8 }}
        />
      ) : timedOut ? (
        <Result
          icon={<WarningOutlined style={{ color: '#faad14' }} />}
          title="Restart Timed Out"
          subTitle="Headscale did not come back online within 60 seconds. Please check the container logs."
          style={{ paddingBlock: 8 }}
        />
      ) : (
        <div className="text-center py-6">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
          <div className="mt-4 text-secondary">
            Waiting for Headscale to come back online…
          </div>
        </div>
      )}
    </Modal>
  );
}
