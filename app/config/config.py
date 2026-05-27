import os
from pydantic import BaseModel, Field

CONFIG_PATH = "config.toml"

class OptionsConfig(BaseModel):
    enable_anki_cards_editor: bool = Field(default=False)

class DictionariesConfig(BaseModel):
    cambridge: bool = Field(default=True)
    merriam: bool = Field(default=True)

class Config(BaseModel):
    options: OptionsConfig = Field(default_factory=lambda: OptionsConfig())
    dictionaries: DictionariesConfig = Field(default_factory=lambda: DictionariesConfig())

def save_config(config: Config):
    """Save Config object to config.toml."""
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        config_dict = config.model_dump()
        for section, options in config_dict.items():
            f.write(f'[{section}]\n')
            for key, value in options.items():
                if isinstance(value, bool):
                    f.write(f'{key} = {"true" if value else "false"}\n')
                elif isinstance(value, (int, float)):
                    f.write(f'{key} = {value}\n')
                else:
                    f.write(f'{key} = "{value}"\n')
            f.write('\n')

def ensure_config_exists():
    """Check if config.toml exists, if not create it with default values."""
    if not os.path.exists(CONFIG_PATH):
        print(f"{CONFIG_PATH} not found. Creating with default values...")
        config = Config()
        save_config(config)
