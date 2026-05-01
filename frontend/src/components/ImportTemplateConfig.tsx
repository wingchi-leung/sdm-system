import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Trash2, Plus } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ColumnMapping {
  [key: string]: string;
}

interface TemplateResponse {
  column_mapping: ColumnMapping;
  is_active: boolean;
}

const AVAILABLE_FIELDS = [
  { name: 'name', label: '姓名', required: true },
  { name: 'sex', label: '性别', required: false },
  { name: 'phone', label: '手机号', required: false },
  { name: 'email', label: '邮箱', required: false },
  { name: 'identity_type', label: '证件类型', required: false },
  { name: 'identity_number', label: '证件号码', required: false },
  { name: 'occupation', label: '职业', required: false },
  { name: 'industry', label: '行业', required: false },
  { name: 'age', label: '年龄', required: false },
];

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface ImportTemplateConfigProps {
  onConfigSaved?: () => void;
}

export const ImportTemplateConfig: React.FC<ImportTemplateConfigProps> = ({ onConfigSaved }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping>({});
  const [nextColumn, setNextColumn] = useState(0);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<TemplateResponse>(API_PATHS.users.importTemplate);
      if (response.data?.column_mapping) {
        setMappings(response.data.column_mapping);
        const maxIndex = Math.max(...Object.keys(response.data.column_mapping).map(Number), -1);
        setNextColumn(maxIndex + 1);
      }
    } catch (error) {
      console.error('获取模板失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTemplate();
    }
  }, [open, fetchTemplate]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setMappings({});
      setNextColumn(0);
    }
  };

  const handleAddMapping = () => {
    if (nextColumn < COLUMN_LETTERS.length) {
      setMappings((prev) => ({
        ...prev,
        [String(nextColumn)]: '',
      }));
      setNextColumn((prev) => prev + 1);
    }
  };

  const handleRemoveMapping = (colIndex: string) => {
    setMappings((prev) => {
      const newMappings = { ...prev };
      delete newMappings[colIndex];
      return newMappings;
    });
  };

  const handleFieldChange = (colIndex: string, fieldName: string) => {
    setMappings((prev) => ({
      ...prev,
      [colIndex]: fieldName,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 过滤掉未选择的映射
      const validMappings: ColumnMapping = {};
      Object.entries(mappings).forEach(([col, field]) => {
        if (field) {
          validMappings[col] = field;
        }
      });

      // 必须有姓名字段
      if (!Object.values(validMappings).includes('name')) {
        alert('请至少配置姓名字段');
        setSaving(false);
        return;
      }

      const response = await apiRequest(API_PATHS.users.importTemplate, {
        method: 'PUT',
        body: JSON.stringify({ column_mapping: validMappings }),
      });

      if (response.error) {
        alert(response.error);
      } else {
        setOpen(false);
        onConfigSaved?.();
      }
    } catch (error) {
      console.error('保存模板失败', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除导入模板配置吗？')) return;

    try {
      await apiRequest(API_PATHS.users.importTemplate, {
        method: 'DELETE',
      });
      setMappings({});
      setNextColumn(0);
      onConfigSaved?.();
    } catch (error) {
      console.error('删除模板失败', error);
    }
  };

  // 生成预览文本
  const getPreviewText = () => {
    const sortedEntries = Object.entries(mappings)
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([, field]) => field);

    if (sortedEntries.length === 0) {
      return '暂未配置';
    }

    return sortedEntries
      .map(([colIndex, field]) => {
        const letter = COLUMN_LETTERS[Number(colIndex)] || `列${colIndex}`;
        const fieldInfo = AVAILABLE_FIELDS.find((f) => f.name === field);
        return `${letter}列 = ${fieldInfo?.label || field}`;
      })
      .join('，');
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Settings className="h-4 w-4" />
        配置导入模板
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>配置导入模板</DialogTitle>
            <DialogDescription>
              设置 Excel 各列对应的用户字段。第一行为表头，不导入数据。
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-slate-500">加载中...</div>
          ) : (
            <div className="space-y-4">
              {/* 预览 */}
              <Card className="bg-slate-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">模板预览</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">{getPreviewText()}</p>
                </CardContent>
              </Card>

              {/* 已有映射 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">列映射配置</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddMapping}
                    disabled={nextColumn >= COLUMN_LETTERS.length}
                  >
                    <Plus className="h-4 w-4" />
                    添加列
                  </Button>
                </div>

                {Object.keys(mappings).length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">
                    点击"添加列"开始配置
                  </p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {Object.entries(mappings)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([colIndex, field]) => {
                        const letter = COLUMN_LETTERS[Number(colIndex)] || `列${colIndex}`;
                        return (
                          <div
                            key={colIndex}
                            className="flex items-center gap-2 rounded-lg border bg-white p-2"
                          >
                            <span className="w-8 text-sm font-medium text-slate-500">
                              {letter}列
                            </span>
                            <span className="text-slate-400">→</span>
                            <select
                              value={field}
                              onChange={(e) =>
                                handleFieldChange(colIndex, e.target.value)
                              }
                              className="flex flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                            >
                              <option value="">选择字段</option>
                              {AVAILABLE_FIELDS.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label}
                                  {f.required && ' *'}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMapping(colIndex)}
                              className="text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* 字段说明 */}
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-600">
                  <strong>说明：</strong>性别字段请填写"男"或"女"；年龄字段请填写数字。
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {Object.keys(mappings).length > 0 && (
              <Button variant="outline" onClick={handleDelete} className="mr-auto text-rose-600">
                删除配置
              </Button>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
