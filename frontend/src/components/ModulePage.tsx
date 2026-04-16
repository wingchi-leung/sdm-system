import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ModulePageProps {
  title: string;
  description: string;
  highlights: string[];
}

const ModulePage = ({ title, description, highlights }: ModulePageProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>

      <Card className="border-dashed border-slate-300 bg-white/80">
        <CardHeader>
          <CardTitle className="text-xl">模块建设中</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>当前已经预留正式后台入口，后续会按规格文档逐步补齐以下能力：</p>
          <ul className="list-disc space-y-2 pl-5">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModulePage;
