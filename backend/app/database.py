from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv
import os
from urllib.parse import quote_plus  # 添加这行

import pymysql

pymysql.install_as_MySQLdb()

# 加载环境变量
load_dotenv()
password = quote_plus(os.getenv('DB_PASSWORD'))

SQLALCHEMY_DATABASE_URL = f"mysql://{os.getenv('DB_USER')}:{password}@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME')}"

# 创建数据库引擎 

# 定义引擎
engine = create_engine(
    # 数据库地址
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    # echo=True表示引擎将用repr()函数记录所有语句及其参数列表到日志
    echo=True,
 
)
# 在SQLAlchemy中，CRUD都是通过会话(session)进行的，所以我们必须要先创建会话，每一个SessionLocal实例就是一个数据库session
# flush()是指发送数据库语句到数据库，但数据库不一定执行写入磁盘；
# commit()是指提交事务，将变更保存到数据库文件
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# 创建基本映射类 -- 生成数据库
Base = declarative_base()
