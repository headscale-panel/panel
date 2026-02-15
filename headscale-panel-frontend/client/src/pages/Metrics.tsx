import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import DashboardLayout from '@/components/DashboardLayout';
import { cn } from '@/lib/utils';
import { Activity, Clock, Server, TrendingUp, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { metricsAPI } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/index';

export default function Metrics() {
  const t = useTranslation();
  const [timeRange, setTimeRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    avgDuration: 0,
    totalOnline: 0,
    totalDevices: 0
  });
  const [influxConnected, setInfluxConnected] = useState<boolean | null>(null);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Check InfluxDB connection status first
      const influxStatus: any = await metricsAPI.getInfluxDBStatus().catch(() => ({ connected: false }));
      setInfluxConnected(!!influxStatus?.connected);

      const end = new Date();
      const start = new Date();
      if (timeRange === '7d') start.setDate(end.getDate() - 7);
      if (timeRange === '30d') start.setDate(end.getDate() - 30);
      if (timeRange === '90d') start.setDate(end.getDate() - 90);

      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      const durationStats: any[] = await metricsAPI.getOnlineDurationStats({
        start: formatDate(start),
        end: formatDate(end)
      }).then((r: any) => Array.isArray(r) ? r : r?.data || []).catch(() => []);

      const deviceStatus: any[] = await metricsAPI.getDeviceStatus().then((r: any) => Array.isArray(r) ? r : r?.data || []).catch(() => []);

      const totalDuration = durationStats.reduce((acc, curr) => acc + (curr.online_hours || 0), 0);
      const avgDuration = durationStats.length ? totalDuration / durationStats.length : 0;

      const onlineCount = deviceStatus.filter((d: any) => d.online).length;
      const offlineCount = deviceStatus.length - onlineCount;
      const pieData = [
        { name: t.common.status.online, value: onlineCount },
        { name: t.common.status.offline, value: offlineCount },
      ];

      const sortedActivity = durationStats
          .map((d: any) => ({ name: d.machine_name, hours: parseFloat(d.online_hours?.toFixed(1) || 0) }))
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 10);

      setActivityData(sortedActivity);
      setStatusData(pieData);
      setSummary({
        avgDuration: parseFloat(avgDuration.toFixed(1)),
        totalOnline: onlineCount,
        totalDevices: deviceStatus.length
      });

    } catch (error) {
      console.error(error);
      toast.error(t.metrics.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.metrics.title}</h1>
            <p className="text-muted-foreground mt-1">
              {t.metrics.description}
            </p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t.metrics.last7Days}</SelectItem>
              <SelectItem value="30d">{t.metrics.last30Days}</SelectItem>
              <SelectItem value="90d">{t.metrics.last90Days}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t.metrics.avgOnlineDuration.replace('{range}', timeRange)}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{summary.avgDuration}h</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t.metrics.onlineDevices}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{summary.totalOnline}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.metrics.totalDevicesSuffix.replace('{total}', String(summary.totalDevices))}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </Card>
          
           <Card className="p-5 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t.metrics.dataStatus}</p>
                <p className={cn(
                  "text-lg font-bold mt-2",
                  loading ? "text-foreground" :
                  influxConnected === false ? "text-orange-500" :
                  "text-foreground"
                )}>
                   {loading ? t.metrics.updating : 
                    influxConnected === false ? t.metrics.notConnected :
                    t.metrics.updated}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Server className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Activity Bar Chart */}
          <Card className="p-6">
             <CardHeader className="px-0 pt-0">
              <CardTitle>{t.metrics.activeDevicesRanking}</CardTitle>
            </CardHeader>
            <div className="h-[300px] w-full mt-4">
              {activityData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" unit="h" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                       cursor={{ fill: 'rgba(0,0,0,0.05)' }} 
                    />
                    <Bar dataKey="hours" name={t.metrics.onlineDuration} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t.metrics.noActiveData}
                </div>
              )}
            </div>
          </Card>

           {/* Device Status Pie Chart */}
          <Card className="p-6">
             <CardHeader className="px-0 pt-0">
              <CardTitle>{t.metrics.deviceStatusDistribution}</CardTitle>
            </CardHeader>
            <div className="h-[300px] w-full mt-4">
              {statusData.length > 0 && summary.totalDevices > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : '#e5e7eb'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
              ) : (
                 <div className="h-full flex items-center justify-center text-muted-foreground">
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {t.metrics.noDeviceData}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
