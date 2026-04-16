import { Button, Result, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Component, ReactNode } from "react";

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="auth-page p-8">
          <Result
            status="error"
            title="An unexpected error occurred."
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            }
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
