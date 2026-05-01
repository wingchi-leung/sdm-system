import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const COLUMN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface ImportUsersProps {
  onImportSuccess?: () => void;
}

export const ImportUsers: React.FC<ImportUsersProps> = ({ onImportSuccess }) => {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<TemplateResponse>(API_PATHS.users.importTemplate);
      setTemplate(response.data || null);
    } catch (error) {
      console.error('获取模板失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTemplate();
      setSelectedFile(null);
      setResult(null);
    }
  }, [open, fetchTemplate]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedFile(null);
      setResult(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('请选择 Excel 文件 (.xlsx 或 .xls)');
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('请选择 Excel 文件 (.xlsx 或 .xls)');
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    try {
      // 将文件转为 Base64
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      const response = await apiRequest<ImportResult>(API_PATHS.users.importExcel, {
        method: 'POST',
        body: JSON.stringify({ file_content: base64 }),
      });

      if (response.error) {
        alert(response.error);
      } else {
        setResult(response.data || null);
        if (response.data?.success > 0) {
          onImportSuccess?.();
        }
      }
    } catch (error) {
      console.error('导入失败', error);
    } finally {
      setImporting(false);
    }
  };

  // 生成模板说明文本
  const getTemplateDesc = () => {
    if (!template || !template.column_mapping || Object.keys(template.column_mapping).length === 0) {
      return null;
    }

    const sortedEntries = Object.entries(template.column_mapping)
      .sort(([a], [b]) => Number(a) - Number(b))
      .filter(([, field]) => field);

    return sortedEntries.map(([colIndex, field]) => {
      const letter = COLUMN_LETTERS[Number(colIndex)] || `列${colIndex}`;
      const fieldLabels: Record<string, string> = {
        name: '姓名',
        sex: '性别',
        phone: '手机号',
        email: '邮箱',
        identity_type: '证件类型',
        identity_number: '证件号码',
        occupation: '职业',
        industry: '行业',
        age: '年龄',
      };
      return { letter, label: fieldLabels[field] || field };
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Upload className="h-4 w-4" />
        导入Excel
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>导入用户</DialogTitle>
            <DialogDescription>上传 Excel 文件批量导入用户</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 text-center text-slate-500">加载中...</div>
          ) : (
            <div className="space-y-4">
              {/* 模板说明 */}
              {getTemplateDesc() && (
                <Card className="bg-slate-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileSpreadsheet className="h-4 w-4" />
                      当前模板配置
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {getTemplateDesc()!.map(({ letter, label }) => (
                        <span
                          key={letter}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
                        >
                          {letter}列 = {label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      第一行是表头，不导入数据
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 未配置模板提示 */}
              {(!template || !template.is_active || Object.keys(template.column_mapping || {}).length === 0) && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-amber-700">
                      请先配置导入模板，再进行导入操作
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* 文件选择 */}
              {template?.is_active && Object.keys(template.column_mapping || {}).length > 0 && (
                <>
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      selectedFile
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
                        <div className="text-left">
                          <p className="font-medium text-slate-700">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                          className="ml-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto h-10 w-10 text-slate-400" />
                        <p className="mt-2 text-sm text-slate-600">
                          拖拽 Excel 文件到此处，或
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          选择文件
                        </Button>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* 导入结果 */}
                  {result && (
                    <Card className={result.failed === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          {result.failed === 0 ? (
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium text-slate-700">
                              导入完成
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              成功导入 {result.success} 条，失败 {result.failed} 条
                            </p>
                            {result.errors.length > 0 && (
                              <div className="mt-2 max-h-32 overflow-y-auto rounded bg-white/50 p-2">
                                {result.errors.slice(0, 10).map((err, i) => (
                                  <p key={i} className="text-xs text-slate-500">
                                    {err}
                                  </p>
                                ))}
                                {result.errors.length > 10 && (
                                  <p className="text-xs text-slate-400">
                                    ...还有 {result.errors.length - 10} 条错误
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {result ? '关闭' : '取消'}
            </Button>
            {template?.is_active && Object.keys(template.column_mapping || {}).length > 0 && !result && (
              <Button onClick={handleImport} disabled={!selectedFile || importing}>
                {importing ? '导入中...' : '开始导入'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
