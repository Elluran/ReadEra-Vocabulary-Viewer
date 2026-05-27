from pydantic import BaseModel, Field

class OptionsConfig(BaseModel):
    enable_anki_cards_editor: bool = Field(default=False)

class Config(BaseModel):
    options: OptionsConfig
