"""Colour palettes and the application stylesheet.

Themes are data, not code: adding one means adding an entry to THEMES.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Palette:
    name: str
    background: str
    deep: str
    panel: str
    panel_alt: str
    border: str
    text: str
    text_dim: str
    accent: str
    accent_soft: str
    secondary: str
    danger: str
    success: str


THEMES: dict[str, Palette] = {
    "nebula": Palette(
        name="Nebula",
        background="#070912",
        deep="#04050c",
        panel="#0e1120",
        panel_alt="#141930",
        border="#232a45",
        text="#e8ecff",
        text_dim="#8590b5",
        accent="#7c6bff",
        accent_soft="#a99bff",
        secondary="#39d8ff",
        danger="#ff6b81",
        success="#5ce6a8",
    ),
    "aurora": Palette(
        name="Aurora",
        background="#04100f",
        deep="#020a09",
        panel="#0a1a1a",
        panel_alt="#0f2626",
        border="#1d3b3a",
        text="#e4fbf6",
        text_dim="#79a39c",
        accent="#2fe6b0",
        accent_soft="#7ff2d2",
        secondary="#4fb8ff",
        danger="#ff7a7a",
        success="#7cf0a8",
    ),
    "ember": Palette(
        name="Ember",
        background="#120806",
        deep="#0a0403",
        panel="#1c0f0b",
        panel_alt="#281611",
        border="#43241b",
        text="#ffeee6",
        text_dim="#b3897a",
        accent="#ff8a3d",
        accent_soft="#ffb37a",
        secondary="#ffd166",
        danger="#ff5f5f",
        success="#8fe388",
    ),
    "mono": Palette(
        name="Monochrome",
        background="#0b0d10",
        deep="#050609",
        panel="#12161b",
        panel_alt="#191f26",
        border="#2a323c",
        text="#eef2f6",
        text_dim="#8b96a3",
        accent="#cfd8e3",
        accent_soft="#ffffff",
        secondary="#9fb3c8",
        danger="#ff8080",
        success="#8fd8a8",
    ),
}

DEFAULT_THEME = "nebula"


def get_palette(name: str) -> Palette:
    return THEMES.get(name, THEMES[DEFAULT_THEME])


def build_stylesheet(palette: Palette) -> str:
    """Application-wide Qt stylesheet for one palette."""
    return f"""
    QWidget {{
        color: {palette.text};
        font-family: "Segoe UI", "Inter", "Helvetica Neue", sans-serif;
        font-size: 14px;
    }}
    QDialog, QMainWindow {{
        background-color: {palette.background};
    }}
    QLabel[role="title"] {{
        font-size: 26px;
        font-weight: 600;
        letter-spacing: 6px;
    }}
    QLabel[role="subtitle"] {{
        color: {palette.text_dim};
        font-size: 13px;
        letter-spacing: 1px;
    }}
    QLabel[role="caption"] {{
        color: {palette.text_dim};
        font-size: 12px;
    }}
    QPushButton {{
        background-color: {palette.panel_alt};
        border: 1px solid {palette.border};
        border-radius: 10px;
        padding: 9px 18px;
        color: {palette.text};
    }}
    QPushButton:hover {{
        border-color: {palette.accent};
        background-color: {palette.panel};
    }}
    QPushButton:pressed {{
        background-color: {palette.deep};
    }}
    QPushButton:disabled {{
        color: {palette.text_dim};
        border-color: {palette.border};
    }}
    QPushButton[role="primary"] {{
        background-color: {palette.accent};
        border: none;
        color: #0a0a12;
        font-weight: 600;
    }}
    QPushButton[role="primary"]:hover {{
        background-color: {palette.accent_soft};
    }}
    QPushButton[role="danger"] {{
        border-color: {palette.danger};
        color: {palette.danger};
    }}
    QPushButton[role="ghost"] {{
        background: transparent;
        border: 1px solid {palette.border};
    }}
    QLineEdit, QTextEdit, QPlainTextEdit, QComboBox, QSpinBox, QDoubleSpinBox {{
        background-color: {palette.panel};
        border: 1px solid {palette.border};
        border-radius: 8px;
        padding: 7px 10px;
        selection-background-color: {palette.accent};
        selection-color: #0a0a12;
    }}
    QComboBox::drop-down {{
        border: none; width: 22px;
        subcontrol-origin: padding; subcontrol-position: center right;
    }}
    QComboBox::down-arrow {{
        image: none;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid {palette.text_dim};
        width: 0; height: 0; margin-right: 8px;
    }}
    QSpinBox::up-button, QDoubleSpinBox::up-button,
    QSpinBox::down-button, QDoubleSpinBox::down-button {{
        background: {palette.panel_alt};
        border: none; width: 16px; margin: 1px;
        border-radius: 4px;
    }}
    QSpinBox::up-arrow, QDoubleSpinBox::up-arrow {{
        image: none;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 5px solid {palette.text_dim};
        width: 0; height: 0;
    }}
    QSpinBox::down-arrow, QDoubleSpinBox::down-arrow {{
        image: none;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid {palette.text_dim};
        width: 0; height: 0;
    }}
    QComboBox QAbstractItemView {{
        background-color: {palette.panel};
        border: 1px solid {palette.border};
        selection-background-color: {palette.panel_alt};
        outline: none;
    }}
    QCheckBox {{ spacing: 9px; }}
    QCheckBox::indicator {{
        width: 17px; height: 17px;
        border: 1px solid {palette.border};
        border-radius: 5px;
        background: {palette.panel};
    }}
    QCheckBox::indicator:checked {{
        background: {palette.accent};
        border-color: {palette.accent};
    }}
    QSlider::groove:horizontal {{
        height: 4px; border-radius: 2px; background: {palette.border};
    }}
    QSlider::handle:horizontal {{
        background: {palette.accent};
        width: 14px; height: 14px;
        margin: -6px 0; border-radius: 7px;
    }}
    QScrollArea {{ background: transparent; border: none; }}
    QScrollBar:vertical {{
        background: transparent; width: 8px; margin: 2px;
    }}
    QScrollBar::handle:vertical {{
        background: {palette.border}; border-radius: 4px; min-height: 30px;
    }}
    QScrollBar::handle:vertical:hover {{ background: {palette.accent}; }}
    QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
    QScrollBar:horizontal {{ height: 0; }}
    QListWidget {{
        background-color: {palette.panel};
        border: 1px solid {palette.border};
        border-radius: 10px;
        padding: 5px;
        outline: none;
    }}
    QListWidget::item {{
        padding: 9px 10px; border-radius: 8px; color: {palette.text};
    }}
    QListWidget::item:selected {{
        background-color: {palette.panel_alt};
        color: {palette.text};
    }}
    QTabWidget::pane {{
        border: 1px solid {palette.border};
        border-radius: 10px;
        top: -1px;
    }}
    QTabBar::tab {{
        background: transparent;
        padding: 9px 16px;
        color: {palette.text_dim};
        border-bottom: 2px solid transparent;
    }}
    QTabBar::tab:selected {{
        color: {palette.text};
        border-bottom: 2px solid {palette.accent};
    }}
    QGroupBox {{
        border: 1px solid {palette.border};
        border-radius: 10px;
        margin-top: 16px;
        padding-top: 10px;
    }}
    QGroupBox::title {{
        subcontrol-origin: margin;
        left: 12px;
        padding: 0 6px;
        color: {palette.text_dim};
    }}
    QToolTip {{
        background-color: {palette.panel_alt};
        border: 1px solid {palette.border};
        color: {palette.text};
        padding: 6px;
    }}
    """
