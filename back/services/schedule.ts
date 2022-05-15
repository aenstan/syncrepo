import { Service, Inject } from 'typedi';
import winston from 'winston';
import nodeSchedule from 'node-schedule';
import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process';
import {
  ToadScheduler,
  LongIntervalJob,
  AsyncTask,
  SimpleIntervalSchedule,
} from 'toad-scheduler';
import dayjs from 'dayjs';

interface ScheduleTaskType {
  id: number;
  command: string;
  name?: string;
  schedule?: string;
}

export interface TaskCallbacks {
  onStart?: (
    cp: ChildProcessWithoutNullStreams,
    startTime: dayjs.Dayjs,
  ) => void;
  onEnd?: (
    cp: ChildProcessWithoutNullStreams,
    endTime: dayjs.Dayjs,
    diff: number,
  ) => void;
  onError?: (message: string) => void;
}

@Service()
export default class ScheduleService {
  private scheduleStacks = new Map<string, nodeSchedule.Job>();

  private intervalSchedule = new ToadScheduler();

  private maxBuffer = 200 * 1024 * 1024;

  constructor(@Inject('logger') private logger: winston.Logger) {}

  async runTask(command: string, callbacks: TaskCallbacks = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const startTime = dayjs();
        const cp = spawn(command, { shell: '/bin/bash' });

        callbacks.onStart?.(cp, startTime);

        cp.stderr.on('data', (data) => {
          this.logger.error(
            '执行任务%s失败，时间：%s, 错误信息：%j',
            command,
            new Date().toLocaleString(),
            data.toString(),
          );
          callbacks.onError?.(data.toString());
        });

        cp.on('error', (err) => {
          this.logger.error(
            '执行任务%s失败，时间：%s, 错误信息：%j',
            command,
            new Date().toLocaleString(),
            err,
          );
          callbacks.onError?.(JSON.stringify(err));
        });

        cp.on('exit', async (code, signal) => {
          this.logger.info(
            `${command} pid: ${cp.pid} exit ${code} signal ${signal}`,
          );
        });

        cp.on('close', async (code) => {
          const endTime = dayjs();
          this.logger.info(`${command} pid: ${cp.pid} closed ${code}`);
          callbacks.onEnd?.(cp, endTime, endTime.diff(startTime, 'seconds'));
          resolve(null);
        });
      } catch (error) {
        await this.logger.error(
          '执行任务%s失败，时间：%s, 错误信息：%j',
          command,
          new Date().toLocaleString(),
          error,
        );
        callbacks.onError?.(JSON.stringify(error));
        resolve(null);
      }
    });
  }

  async createCronTask(
    { id = 0, command, name, schedule = '' }: ScheduleTaskType,
    callbacks?: TaskCallbacks,
  ) {
    const _id = this.formatId(id);
    this.logger.info(
      '[创建cron任务]，任务ID: %s，cron: %s，任务名: %s，执行命令: %s',
      _id,
      schedule,
      name,
      command,
    );

    this.scheduleStacks.set(
      _id,
      nodeSchedule.scheduleJob(_id, schedule, async () => {
        await this.runTask(command, callbacks);
      }),
    );
  }

  async cancelCronTask({ id = 0, name }: ScheduleTaskType) {
    const _id = this.formatId(id);
    this.logger.info('[取消定时任务]，任务名：%s', name);
    this.scheduleStacks.has(_id) && this.scheduleStacks.get(_id)?.cancel();
  }

  async createIntervalTask(
    { id = 0, command, name = '' }: ScheduleTaskType,
    schedule: SimpleIntervalSchedule,
    runImmediately = true,
    callbacks?: TaskCallbacks,
  ) {
    const _id = this.formatId(id);
    this.logger.info(
      '[创建interval任务]，任务ID: %s，任务名: %s，执行命令: %s',
      _id,
      name,
      command,
    );
    const task = new AsyncTask(
      name,
      async () => {
        return new Promise(async (resolve, reject) => {
          await this.runTask(command, callbacks);
        });
      },
      (err) => {
        this.logger.error(
          '执行任务%s失败，时间：%s, 错误信息：%j',
          command,
          new Date().toLocaleString(),
          err,
        );
      },
    );

    const job = new LongIntervalJob({ ...schedule, runImmediately }, task, _id);

    this.intervalSchedule.addIntervalJob(job);
  }

  async cancelIntervalTask({ id = 0, name }: ScheduleTaskType) {
    const _id = this.formatId(id);
    this.logger.info('[取消interval任务]，任务ID: %s，任务名：%s', _id, name);
    this.intervalSchedule.removeById(_id);
  }

  private formatId(id: number): string {
    return String(id);
  }
}