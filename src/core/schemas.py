from typing import Literal
from pydantic import BaseModel

class Health(BaseModel):
    status: str
    env: str
    db: Literal['ok', 'unavailable']
