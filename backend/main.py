from fastapi import FastAPI
from app.app import create_customer_app
from admin.app import create_admin_app
from contextlib import asynccontextmanager
import logging
from db.db_manager import get_database

import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level = logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        db = get_database()
        app.state.db = db

        db.client.admin.command('ping')
        logger.info("Database connected successfully!!")
        
        await create_indexes(db)

        logger.info("Database indexes created...")

    except Exception as e:
        logger.info(f"Failed to initiate the appication: {str(e)}")
        raise e

    yield
    #cleanup the shutdowm
    if hasattr(app.state,'db'):
        app.state.db.client.close()
        logger.info("Database connecton closed")

async def create_indexes(db):
    try:
        #user indexing
        await db.db['users'].create_index("email",unique = True)
        # await db.db['users'].create_index('phone',unique=True)
        await db.db['users'].create_index('role')

        #product indexing
        await db.db['products'].create_index("name")
        await db.db['products'].create_index("category")
        await db.db['products'].create_index("price")

        logger.info("All indexes created successfully!!")
    except Exception as e:
        logger.info(f"Error creating indexes: {str(e)}")

app = FastAPI(
    title = "Main-Server",
    version="1.0.0",
    lifespan=lifespan
)

customer_app = create_customer_app()
ws_app = create_admin_app()

app.state.customer_app = customer_app
app.state.ws_app = ws_app

# app.mount("/api",customer_app)
app.mount("/admin",ws_app)

ENV = os.getenv('ENVIRONMENT')

@app.get("/")
async def root():
    return {
        "message": "SmartBag",
        "environment": ENV
    }

if __name__ == "__main__":
    import uvicorn

    if ENV == 'Development':
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port = 8000,
            reload = True
        )
    else:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port = 80,
            reload = True
        )