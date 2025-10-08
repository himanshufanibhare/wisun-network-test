#!/usr/bin/env python3
"""
Universal Logger Module (Generic Only)
Reusable logging functionality for all scripts
"""

import logging
import os


def setup_logger(name, log_file=None, log_level=logging.INFO):
    """
    Setup a reusable logger.

    Args:
        name (str): Logger name
        log_file (str): Optional log file path. If None, stores in ./logs/<name>.txt
        log_level: Logging level (default: INFO)

    Returns:
        logger: Configured logger instance
    """
    # Default log directory = ./logs
    if log_file is None:
        log_dir = os.path.join(os.getcwd(), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"{name}.txt")
    else:
        # If log_file is a directory, append filename
        if os.path.isdir(log_file):
            log_file = os.path.join(log_file, f"{name}.txt")
        else:
            os.makedirs(os.path.dirname(log_file), exist_ok=True)

    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(log_level)

    # Clear existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # File handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)

    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # Add handlers
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def get_logger(name, log_file=None):
    """Helper for quick logger setup"""
    return setup_logger(name, log_file)