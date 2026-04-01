import { Button, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Streamdown } from 'streamdown';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main>
        <Spin indicator={<LoadingOutlined spin />} />
        Example Page
        <Streamdown>Any **markdown** content</Streamdown>
        <Button type="primary">Example Button</Button>
      </main>
    </div>
  );
}
