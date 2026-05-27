from pydantic import BaseModel, Field

class OptionsConfig(BaseModel):
    enable_anki_cards_editor: bool = Field(default=False)

class DictionariesConfig(BaseModel):
    cambridge: bool = Field(default=True)
    merriam: bool = Field(default=True)

class Config(BaseModel):
    options: OptionsConfig = Field(default_factory=lambda: OptionsConfig())
    dictionaries: DictionariesConfig = Field(default_factory=lambda: DictionariesConfig())
