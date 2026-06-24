import cv2
import numpy as np


def detect_issue(path: str) -> str:
    """Simple heuristic-based issue detector.

    Args:
        path: Path to an image file.

    Returns:
        One of: 'Road', 'Sanitation', 'Water', 'Electricity', 'StreetLight'.

    Raises:
        FileNotFoundError: If the image cannot be read.
    """
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Image not found or unreadable: {path}")

    # Ensure 3-channel image
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)

    # brightness in [0,255]; edge_density as percentage [0,100]
    brightness = float(gray.mean())
    edge_density = float(edges.mean()) / 255.0 * 100.0

    # Heuristics (tunable): prioritize high edge density -> road defects
    if edge_density > 10.0:
        return "Road"
    if brightness < 80.0:
        return "Sanitation"
    if brightness > 160.0:
        return "Water"

    # Fallback
    return "Road"