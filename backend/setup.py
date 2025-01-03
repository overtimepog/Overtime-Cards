import os
import sys
from setuptools import setup, find_packages
from setuptools.command.develop import develop
from setuptools.command.install import install

class PostDevelopCommand(develop):
    """Post-installation for development mode."""
    def run(self):
        develop.run(self)

class PostInstallCommand(install):
    """Post-installation for installation mode."""
    def run(self):
        install.run(self)

# Setup configuration
setup(
    name='overtime-cards-api',
    version='1.1.0',
    packages=find_packages(),
    install_requires=[
        'fastapi>=0.68.0',
        'uvicorn>=0.15.0',
        'gunicorn>=20.1.0',
        'python-dotenv>=0.19.0',
        'sqlalchemy>=1.4.0',
        'psycopg2-binary>=2.9.0',
        'python-jose>=3.3.0',
        'passlib>=1.7.4',
        'python-multipart>=0.0.5',
        'sentry-sdk>=1.5.0',
    ],
    python_requires='>=3.8',
    author='Overtime',
    description='A multiplayer card games API',
    entry_points={
        'console_scripts': [
            'overtime-cards-api=main:app',
        ],
    },
    classifiers=[
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
    ],
    cmdclass={
        'develop': PostDevelopCommand,
        'install': PostInstallCommand,
    },
)
