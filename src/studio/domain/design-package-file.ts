export async function readDesignPackageFiles(
  files: readonly File[],
): Promise<unknown> {
  if (files.length !== 1) throw Error("每次请选择或拖入一个 JSON 设计包文件");
  const file = files[0];
  if (!/\.json$/i.test(file.name))
    throw Error("请选择 JSON 设计包文件，不支持文件夹或其他格式");
  if (file.size > 30 * 1024 * 1024) throw Error("设计包不能超过30MiB");
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    if (error instanceof SyntaxError)
      throw Error("JSON 格式不正确，请检查设计包文件");
    throw error;
  }
}
