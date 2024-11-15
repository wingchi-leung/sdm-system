# from sqlalchemy.orm import Session

# from models import models
# from schemas import schemas

# def get_allactivity(db: Session):
#     """
#     获取所有签到记录
#     :param db: 数据库会话
#     :param user_id: 用户id
#     :return: 用户信息
#     """
#     return db.query(models.CheckIn).all()

# def create_user(db: Session, checkIn: schemas.checkIn):
#     """
#     创建签到记录
#     :param db: 数据库会话
#     :param user: 签到模型
#     :return:  
#     """
     
#     db_checkIn = models.CheckIn(name=checkIn.name, activity=checkIn.activity)
#     db.add(db_checkIn)      # 添加到会话
#     db.commit()          # 提交到数据库
#     db.refresh(db_user)  # 刷新数据库
#     return db_checkIn