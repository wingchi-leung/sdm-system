from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
 
from app.core.config import settings
import pymysql
from urllib.parse import quote_plus

pymysql.install_as_MySQLdb()

# 加载环境变量
 
password = settings.MYSQL_PASSWORD
encoded_password = quote_plus(password)

SQLALCHEMY_DATABASE_URL = f"mysql://{settings.MYSQL_USER}:{encoded_password}@{settings.MYSQL_HOST}/{settings.MYSQL_DB}"

# 创建数据库引擎
engine = create_engine(
    # 数据库地址
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    # 通过环境变量控制 SQL 日志，生产环境应设为 False
    echo=settings.DB_ECHO,
    # 连接池配置
    pool_size=20,        # 常驻连接数
    max_overflow=10,     # 最大溢出连接数
)
# 在SQLAlchemy中，CRUD都是通过会话(session)进行的，所以我们必须要先创建会话，每一个SessionLocal实例就是一个数据库session
# flush()是指发送数据库语句到数据库，但数据库不一定执行写入磁盘；
# commit()是指提交事务，将变更保存到数据库文件
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


Base = declarative_base()
