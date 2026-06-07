import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        username: dto.username.trim(),
        passwordHash
      }
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() }
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: BigInt(userId) }
    });

    return this.serializeUser(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: BigInt(userId) }
    });

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password login is not available for this account.');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const reused = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (reused) {
      throw new ConflictException('New password must be different from current password.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      data: { passwordHash },
      where: { id: BigInt(userId) }
    });

    return { ok: true };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET')
      });
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: BigInt(payload.sub) }
      });

      return this.buildAuthResponse(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  private async buildAuthResponse(user: { id: bigint; email: string; username: string; avatarUrl: string | null }) {
    const payload = {
      sub: Number(user.id),
      email: user.email,
      username: user.username
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET')
      })
    ]);

    return {
      accessToken,
      refreshToken,
      user: this.serializeUser(user)
    };
  }

  private serializeUser(user: { id: bigint; email: string; username: string; avatarUrl: string | null }) {
    return {
      id: Number(user.id),
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl
    };
  }
}
