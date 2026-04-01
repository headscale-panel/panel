import { Button, Result } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="auth-page">
      <Result
        status="404"
        title="404"
        subTitle="Sorry, the page you are looking for doesn't exist."
        extra={
          <Button type="primary" icon={<HomeOutlined />} onClick={() => setLocation("/")}>
            Go Home
          </Button>
        }
      />
    </div>
  );
}
