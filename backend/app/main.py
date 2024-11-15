# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import mysql.connector
from datetime import datetime

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库配置
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": ".Mysql@1234",
    "database": "sdm_db"
}

# 签到表单模型
class CheckInForm(BaseModel):
    name: str
    activity: str
    

# 数据库连接函数
def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except mysql.connector.Error as err:
        raise HTTPException(status_code=500, detail=f"数据库连接失败: {err}")

# 签到接口
@app.post("/checkin")
async def checkin(form: CheckInForm):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = """
        INSERT INTO checkin_records (name,  activity , checkin_time)
        VALUES (%s, %s, %s)
        """
        cursor.execute(sql, (form.name, form.activity,   datetime.now()))
        conn.commit()
        return {"status": "success", "message": "签到成功"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# 获取签到记录
@app.get("/records")
async def get_records():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM checkin_records ORDER BY checkin_time DESC")
        records = cursor.fetchall()
        return records
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)