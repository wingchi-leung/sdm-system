import React, { useRef, useState, useEffect, MouseEvent, TouchEvent  } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Undo2, Save, Trash2 } from 'lucide-react';
// 定义 props 接口
interface SignaturePadProps {
    onSave: (signatureData: string) => void;
    onClose: () => void;
  }
  
  // 定义坐标接口
  interface Coordinates {
    offsetX: number;
    offsetY: number;
  }
  const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  
    // Initialize canvas context
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      setContext(ctx);
    }, []);
  
    const startDrawing = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
      if (!context) return;
      const { offsetX, offsetY } = getCoordinates(e);
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      setIsDrawing(true);
    };
  
    const draw = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !context) return;
      const { offsetX, offsetY } = getCoordinates(e);
      context.lineTo(offsetX, offsetY);
      context.stroke();
    };
  
    const stopDrawing = () => {
      if (isDrawing && context) {
        context.closePath();
        setIsDrawing(false);
      }
    };
  
    const getCoordinates = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>): Coordinates => {
      const canvas = canvasRef.current;
      if (!canvas) return { offsetX: 0, offsetY: 0 };
  
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
  
      if ('touches' in e && e.touches[0]) {
        return {
          offsetX: (e.touches[0].clientX - rect.left) * scaleX,
          offsetY: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
  
      if ('clientX' in e) {
        return {
          offsetX: (e.clientX - rect.left) * scaleX,
          offsetY: (e.clientY - rect.top) * scaleY
        };
      }
  
      return { offsetX: 0, offsetY: 0 };
    };
  
    const clearCanvas = () => {
      if (!context || !canvasRef.current) return;
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };
  
    const saveSignature = () => {
      if (!canvasRef.current) return;
      const signatureData = canvasRef.current.toDataURL('image/png');
      onSave(signatureData);
    };
  
    const handleUndo = () => {
      clearCanvas();
    };
  
    return (
      <Card className="w-full max-w-xl mx-auto">
        <CardHeader>
          <CardTitle className="text-center">手写签名</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-2 bg-white">
            <canvas
              ref={canvasRef}
              width={500}
              height={200}
              className="w-full border border-gray-200 rounded touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              className="flex items-center gap-2"
            >
              <Undo2 className="w-4 h-4" />
              撤销
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCanvas}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              清除
            </Button>
            <Button
              size="sm"
              onClick={saveSignature}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              确认
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
export default SignaturePad;