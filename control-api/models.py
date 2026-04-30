from pydantic import BaseModel
from typing import Optional, Literal


class SensorCreate(BaseModel):
    name: str
    type: str
    location: str


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    location: Optional[str] = None


class SensorConfig(BaseModel):
    enabled: Optional[bool] = True
    interval: int
    mean: float
    std: float
    unit: Optional[Literal["C", "F"]] = None


class CommandCreate(BaseModel):
    command: str  # JSON string or dict serialized by caller
