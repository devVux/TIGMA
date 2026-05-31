from pydantic import BaseModel
from typing import Optional


class Sensor(BaseModel):
    name: str
    type: str
    location: str
    enabled: bool
    interval: Optional[int] = None
    mean: float
    std: float


class SensorUpdate(BaseModel):
    type: Optional[str] = None
    location: Optional[str] = None
    enabled: Optional[bool] = None
    interval: Optional[int] = None
    mean: Optional[float] = None
    std: Optional[float] = None
