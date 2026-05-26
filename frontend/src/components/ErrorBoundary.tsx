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

import type { ReactNode } from 'react';
import type { I18nContextType } from '@/i18n';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Result, Typography } from 'antd';
import { Component } from 'react';
import { I18nContext } from '@/i18n';

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  static contextType = I18nContext;
  declare context: I18nContextType;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const t = this.context?.t;
      return (
        <div className="auth-page p-8">
          <Result
            status="error"
            title={t?.errorBoundary.title ?? 'An unexpected error occurred.'}
            extra={(
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => window.location.reload()}
              >
                {t?.errorBoundary.reload ?? 'Reload Page'}
              </Button>
            )}
          >
            {import.meta.env.DEV && this.state.error?.stack && (
              <Paragraph>
                <Text code className="whitespace-pre-wrap text-12px">
                  {this.state.error.stack}
                </Text>
              </Paragraph>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
